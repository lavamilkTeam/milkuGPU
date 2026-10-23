// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
`timescale 1ns/1ps
module tb_gpu;
    parameter STALLS=1, CORES=4;
    `include "tests/vectors/gpu/config.vh"
    reg clk=0;
    always #5 clk=~clk;
    reg reset=1;
    reg [CORES-1:0] launch=0;
    wire [CORES-1:0] ready,busy,done,fault,retired;
    reg [CORES*16-1:0] masks={CORES*16{1'b1}};
    reg [CORES*16-1:0] launch_pcs;
    reg [CORES*32-1:0] task_bases;
    wire iv,mv,mw;
    wire [15:0] ia,ma;
    wire [31:0] wd;
    wire [CORES*16-1:0] rpc,ractive,rwrite;
    wire [CORES*32-1:0] ri;
    wire [CORES*16*32-1:0] rd;
    reg [31:0] rom[0:65535],ram[0:65535],expected_memory[0:VECTOR_CORES*4096-1];
    reg [575:0] expected[0:CORES*MAX_STEPS-1];
    reg [31:0] rng=32'h12983456;
    wire ir=!STALLS || rng[0];
    wire mr=!STALLS || rng[4];
    integer steps[0:CORES-1];
    integer i,c,l,round,cycles=0,writes=0;
    reg [575:0] row;
    reg [15:0] expected_writes;
    reg [31:0] expected_data;
    reg previous_iv=0,previous_mv=0;
    reg [15:0] previous_ia,previous_ma;
    reg previous_mw;
    reg [31:0] previous_wd;
    milku_gpu #(.CORES(CORES),.LANES(16)) dut (
        .clk(clk),.reset(reset),.launch_valid(launch),.launch_ready(ready),
        .launch_pc(launch_pcs),.launch_mask(masks),.launch_task_base(task_bases),
        .busy(busy),.done(done),.fault(fault),.instruction_valid(iv),.instruction_ready(ir),
        .instruction_address(ia),.instruction_data(rom[ia]),.memory_valid(mv),.memory_ready(mr),
        .memory_write(mw),.memory_address(ma),.memory_write_data(wd),.memory_read_data(ram[ma]),
        .retire_valid(retired),.retire_pc(rpc),.retire_instruction(ri),
        .retire_active(ractive),.retire_write(rwrite),.retire_data(rd)
    );
    always @(negedge clk) rng<={rng[30:0],rng[31]^rng[21]^rng[1]^rng[0]};
    always @(posedge clk) begin
        if(reset) begin previous_iv=0;previous_mv=0;end
        else begin
            if(previous_iv && (!iv || ia!==previous_ia)) $fatal(1,"unstable fetch");
            if(previous_mv && (!mv || {ma,mw,wd}!=={previous_ma,previous_mw,previous_wd}))
                $fatal(1,"unstable memory request");
            previous_iv=iv && !ir;previous_ia=ia;
            previous_mv=mv && !mr;previous_ma=ma;previous_mw=mw;previous_wd=wd;
            if(mv && mr && mw) begin
                if(ma>=CORES*4096 || !masks[ma/256]) $fatal(1,"inactive/invalid store %h",ma);
                ram[ma]<=wd;writes=writes+1;
            end
            cycles=cycles+1;
            if(cycles>500000) $fatal(1,"GPU timeout");
        end
        #1;
        if(!reset) begin
            if(fault) $fatal(1,"unexpected GPU fault %b",fault);
            for(c=0;c<CORES;c=c+1) if(retired[c]) begin
                if(steps[c]>=trace_steps(c)) $fatal(1,"extra retirement");
                row=expected[c*MAX_STEPS+steps[c]];
                expected_writes=row[527:512] & masks[c*16 +: 16];
                if({rpc[c*16 +: 16],ri[c*32 +: 32]}!==row[575:528] ||
                   rwrite[c*16 +: 16]!==expected_writes || ractive[c*16 +: 16]!==masks[c*16 +: 16])
                    $fatal(1,"GPU trace core=%0d step=%0d pc=%h expected=%h",c,steps[c],rpc[c*16 +: 16],row[575:560]);
                for(l=0;l<16;l=l+1) begin
                    expected_data=masks[c*16+l] ? row[l*32 +: 32] : 0;
                    if(rd[(c*16+l)*32 +: 32]!==expected_data)
                        $fatal(1,"GPU result core=%0d lane=%0d step=%0d got=%h expected=%h",c,l,steps[c],rd[(c*16+l)*32 +: 32],expected_data);
                end
                steps[c]=steps[c]+1;
            end
        end
    end
    initial begin
        for(i=0;i<65536;i=i+1) rom[i]=32'h30000000;
        for(i=0;i<CORES;i=i+1) begin
            $readmemh($sformatf("tests/vectors/gpu/program%0d.hex",i),rom,i*4096,i*4096+program_words(i)-1);
            $readmemh($sformatf("tests/vectors/gpu/trace%0d.hex",i),expected,i*MAX_STEPS,i*MAX_STEPS+trace_steps(i)-1);
            launch_pcs[i*16 +: 16]=i*4096;
            task_bases[i*32 +: 32]=i*16;
        end
        $readmemh("tests/vectors/gpu/memory.hex",expected_memory);
        for(i=0;i<CORES;i=i+1) steps[i]=0;
        repeat(3) @(negedge clk);
        reset=0;
        for(round=0;round<2;round=round+1) begin
            for(i=0;i<CORES;i=i+1) masks[i*16 +: 16]=(round==0) ? 16'hffff : (i%2==0 ? 16'h8005 : 16'h0123);
            for(i=0;i<65536;i=i+1) ram[i]=i*32'h10203+32'h31415926;
            for(i=0;i<CORES;i=i+1) steps[i]=0;
            @(negedge clk);
            if(ready!=={CORES{1'b1}}) $fatal(1,"launch not ready");
            launch={CORES{1'b1}};
            @(negedge clk);launch=0;
            wait(done=={CORES{1'b1}});
            @(negedge clk);
            for(i=0;i<CORES;i=i+1) if(steps[i]!=trace_steps(i)) $fatal(1,"missing retirement core=%0d",i);
            for(i=0;i<65536;i=i+1) begin
                expected_data=(i<CORES*4096 && masks[i/256]) ? expected_memory[i] : i*32'h10203+32'h31415926;
                if(ram[i]!==expected_data) $fatal(1,"RAM mismatch round=%0d address=%h",round,i);
            end
            repeat(5) begin
                @(negedge clk);
                if(iv || mv || retired || busy) $fatal(1,"activity after completion");
            end
        end
        $display("PASS GPU %0dx16 STALLS=%0d full/masked relaunch, %0d cycles, %0d stores",CORES,STALLS,cycles,writes);
        $finish;
    end
endmodule
