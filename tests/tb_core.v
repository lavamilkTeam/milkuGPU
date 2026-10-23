// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
`timescale 1ns/1ps
module tb_core;
    localparam WIDTH = 32;
    parameter STALLS = 1;
    `include "tests/vectors/config.vh"
    localparam TRACE_WIDTH = 1195;
    reg clk = 0;
    always #5 clk = ~clk;
    reg reset = 1;
    wire iv, mv, mw, halted, z, c, retired, rw;
    wire [15:0] ia, ma, rpc;
    wire [WIDTH-1:0] wd, lo, hi, rd;
    wire [31:0] ri;
    wire [1:0] error;
    wire [4:0] dest;
    reg [31:0] rom [0:65535];
    reg [WIDTH-1:0] ram [0:65535];
    reg [WIDTH-1:0] expected_memory [0:65535];
    reg [TRACE_WIDTH-1:0] expected [0:STEPS-1];
    reg [WIDTH-1:0] shadow [0:31];
    reg [31:0] random_state = 32'h98172345;
    wire ir = !STALLS || random_state[0];
    wire mr = !STALLS || random_state[3];
    wire [31:0] idata = rom[ia];
    wire [WIDTH-1:0] md = ram[ma];
    integer i, step = 0, cycles = 0;
    reg [TRACE_WIDTH-1:0] observed;
    reg previous_iv = 0, previous_mv = 0;
    reg [15:0] previous_ia, previous_ma;
    reg previous_mw;
    reg [WIDTH-1:0] previous_wd;
    reg [15:0] halted_pc;

    lavaneko_core dut (
        .clk(clk), .reset(reset), .instruction_valid(iv), .instruction_ready(ir),
        .instruction_address(ia), .instruction_data(idata), .memory_valid(mv),
        .memory_ready(mr), .memory_write(mw), .memory_address(ma),
        .memory_write_data(wd), .memory_read_data(md), .halted(halted),
        .flag_zero(z), .flag_carry(c), .result_lo(lo), .result_hi(hi), .md_error(error),
        .retire_valid(retired), .retire_pc(rpc), .retire_instruction(ri),
        .retire_write(rw), .retire_destination(dest), .retire_data(rd)
    );
    always @(negedge clk) begin
        random_state <= {random_state[30:0], random_state[31]^random_state[21]^random_state[1]^random_state[0]};
    end
    always @(posedge clk) begin
        if (!reset) begin
            if (previous_iv && (!iv || ia !== previous_ia))
                $fatal(1, "instruction request changed while stalled");
            if (previous_mv && (!mv || {ma,mw,wd} !== {previous_ma,previous_mw,previous_wd}))
                $fatal(1, "memory request changed while stalled");
            previous_iv = iv && !ir;
            previous_mv = mv && !mr;
            previous_ia = ia;
            previous_ma = ma;
            previous_mw = mw;
            previous_wd = wd;
            if (mv && mr && mw) ram[ma] <= wd;
            cycles = cycles + 1;
            if (cycles > 150000) $fatal(1, "timeout");
        end else begin
            previous_iv = 0;
            previous_mv = 0;
        end
        #1;
        if (!reset && retired) begin
            if (step >= STEPS) $fatal(1, "extra retirement");
            if (rw) shadow[dest] = rd;
            observed = {rpc,ri,ia};
            for (i=0; i<32; i=i+1) observed = (observed << 32) | shadow[i];
            observed = (observed << 107) | {lo,hi,z,c,error,halted,rw,dest,rd};
            if (observed !== expected[step]) begin
                $display("step=%0d pc=%h instruction=%h", step, rpc, ri);
                $display("expected=%h actual=%h", expected[step], observed);
                $fatal(1, "reference model mismatch");
            end
            step = step + 1;
        end
    end
    initial begin
        for (i=0; i<65536; i=i+1) begin rom[i]=32'h30000000; ram[i]=0; expected_memory[i]=0; end
        for (i=0; i<32; i=i+1) shadow[i]=0;
        $readmemh("tests/vectors/program32.hex",rom,0,WORDS-1);
        $readmemh("tests/vectors/trace32.hex",expected);
        $readmemh("tests/vectors/memory32.hex",expected_memory);
        repeat (3) @(negedge clk);
        reset = 0;
        wait(halted);
        @(negedge clk);
        if (step != STEPS) $fatal(1,"retirement count %0d",step);
        for (i=0; i<65536; i=i+1)
            if (ram[i] !== expected_memory[i]) $fatal(1,"memory mismatch at %h",i);
        halted_pc = ia;
        repeat (5) begin
            @(negedge clk);
            if (iv || mv || retired || ia !== halted_pc) $fatal(1,"HALT changed state");
        end
        reset = 1;
        @(negedge clk);
        if (halted || z || c || lo || hi || error || ia || retired) $fatal(1,"reset state");
        $display("PASS core WIDTH=%0d STALLS=%0d retirements=%0d cycles=%0d",WIDTH,STALLS,step,cycles);
        $finish;
    end
endmodule
