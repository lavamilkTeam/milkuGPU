// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
`timescale 1ns/1ps
module tb_gpu_control;
    parameter CORES=4;
    localparam [CORES-1:0] EDGE_CORES=(1 << (CORES-1)) | 1;
    reg clk=0;
    always #5 clk=~clk;
    reg reset=1,ir=1,mr=1;
    reg [CORES-1:0] launch=0;
    reg [CORES*16-1:0] entry=0,mask=0;
    reg [CORES*32-1:0] task_bases;
    wire [CORES-1:0] ready,busy,done,fault,retired;
    wire iv,mv,mw;
    wire [15:0] ia,ma;
    wire [31:0] wd;
    wire [CORES*16-1:0] rpc;
    wire [CORES*32-1:0] ri;
    reg [31:0] rom[0:65535];
    integer i,writes=0,retirements=0;
    reg check_wrap=0;
    milku_gpu #(.CORES(CORES),.LANES(16)) dut (
        .clk(clk),.reset(reset),.launch_valid(launch),.launch_ready(ready),
        .launch_pc(entry),.launch_mask(mask),.launch_task_base(task_bases),
        .busy(busy),.done(done),.fault(fault),
        .instruction_valid(iv),.instruction_ready(ir),.instruction_address(ia),.instruction_data(rom[ia]),
        .memory_valid(mv),.memory_ready(mr),.memory_write(mw),.memory_address(ma),
        .memory_write_data(wd),.memory_read_data(32'b0),
        .retire_valid(retired),.retire_pc(rpc),.retire_instruction(ri),
        .retire_active(),.retire_write(),.retire_data()
    );
    function [31:0] enc;
        input [5:0] op;
        input [4:0] d,a;
        input [15:0] low;
        begin enc={op,d,a,low};end
    endfunction
    task reset_all;
        begin
            @(negedge clk);reset=1;launch=0;
            @(negedge clk);
            if(iv || mv || done || busy || retired || fault) $fatal(1,"reset outputs");
            reset=0;ir=1;mr=1;
        end
    endtask
    task start;
        input [CORES-1:0] which;
        input [CORES*16-1:0] pcs,masks;
        begin
            @(negedge clk);
            if((ready & which)!=which) $fatal(1,"not ready");
            entry=pcs;mask=masks;launch=which;
            @(negedge clk);launch=0;
        end
    endtask
    task wait_done;
        input [CORES-1:0] which;
        begin wait((done & which)==which);@(negedge clk);end
    endtask
    always @(posedge clk) begin
        if(!reset && mv && mr && mw) begin
            writes=writes+1;
            if(ma==101) begin if(wd!==1) $fatal(1,"uniform false path");end
            else if(ma<1000+(CORES-1)*16 || ma>1015+(CORES-1)*16 || wd!==7) $fatal(1,"unexpected store %h=%h",ma,wd);
        end
        #1;
        if(!reset && retired[0]) begin
            retirements=retirements+1;
            if(check_wrap) begin
                if(retirements==1 && rpc[15:0]!==16'hffff) $fatal(1,"wrap start");
                if(retirements==2 && rpc[15:0]!==0) $fatal(1,"wrap end");
            end
        end
    end
    initial begin
        for(i=0;i<CORES;i=i+1) task_bases[i*32 +: 32]=i*16;
        for(i=0;i<65536;i=i+1) rom[i]=32'h30000000;
        rom[0]=enc(20,0,0,0);rom[1]=enc(7,0,0,16'h0800);rom[2]=enc(11,0,0,5);
        rom[3]=enc(9,0,0,100);
        rom[100]=enc(22,0,0,0);rom[101]=enc(1,1,0,7);rom[102]=enc(9,1,0,1000);
        rom[200]=enc(1,1,0,7);rom[201]=enc(9,1,0,1000);
        rom[300]=enc(1,1,0,3);rom[301]=enc(15,2,1,16'h0800);
        reset_all;
        // Divergence faults only core 0; the last core continues independently.
        start(EDGE_CORES,64'd100 << ((CORES-1)*16),{CORES*16{1'b1}});wait_done(EDGE_CORES);
        if(fault!==1 || writes!=16) $fatal(1,"divergence isolation");
        // Uniform true and false decisions on different active subsets.
        start(1,0,1);wait_done(1);
        if(fault || writes!=16) $fatal(1,"uniform true");
        start(1,0,2);wait_done(1);
        if(fault || writes!=17) $fatal(1,"uniform false");
        // No active lanes means immediate completion with no instructions/transactions.
        start({CORES{1'b1}},0,0);wait_done({CORES{1'b1}});
        repeat(5) @(negedge clk);
        if(iv || mv || busy || retired || fault || writes!=17) $fatal(1,"empty mask");
        // Reset during stalled fetch, and reject a launch while busy.
        ir=0;start(1,0,16'hffff);wait(iv);
        @(negedge clk);launch=1;entry=100;
        repeat(3) @(negedge clk);
        if(ready[0] || ia!==0) $fatal(1,"busy launch accepted");
        reset_all;
        // Reset during a stalled store must cancel it, not complete it later.
        mr=0;start(1,200,16'hffff);wait(mv);
        repeat(5) @(negedge clk);
        reset_all;
        repeat(10) @(negedge clk);
        if(mv || writes!=17) $fatal(1,"stale store after reset");
        // Reset during iterative division must not retire an old result.
        start(1,300,16'hffff);
        wait(iv && ir && ia==301);
        repeat(12) @(negedge clk);
        reset_all;
        repeat(45) begin @(negedge clk);if(retired || mv || iv) $fatal(1,"stale division");end
        // 16-bit instruction address wrapping is preserved.
        rom[65535]=0;rom[0]=32'h30000000;retirements=0;check_wrap=1;
        start(1,65535,16'hffff);wait_done(1);
        if(retirements!=2 || fault) $fatal(1,"wrap retirement");
        $display("PASS GPU CORES=%0d divergence/isolation/uniform branches/masks/busy launch/reset/fetch-store-division/PC wrap",CORES);
        $finish;
    end
    initial begin #1000000;$fatal(1,"control timeout");end
endmodule
