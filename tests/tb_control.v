// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
`timescale 1ns/1ps
module tb_control;
    reg clk=0;
    always #5 clk=~clk;
    reg reset=1, ir=0, mr=0;
    reg [31:0] instruction=32'h30000000;
    wire iv,mv,mw,halted,z,c,retired,rw;
    wire [15:0] ia,ma,rpc;
    wire [31:0] wd,lo,hi,rd;
    wire [31:0] ri;
    wire [1:0] error;
    wire [4:0] dest;
    integer i;
    lavaneko_core dut (
        .clk(clk),.reset(reset),.instruction_valid(iv),.instruction_ready(ir),
        .instruction_address(ia),.instruction_data(instruction),.memory_valid(mv),
        .memory_ready(mr),.memory_write(mw),.memory_address(ma),.memory_write_data(wd),
        .memory_read_data(32'b0),.halted(halted),.flag_zero(z),.flag_carry(c),
        .result_lo(lo),.result_hi(hi),.md_error(error),.retire_valid(retired),
        .retire_pc(rpc),.retire_instruction(ri),.retire_write(rw),
        .retire_destination(dest),.retire_data(rd)
    );
    task reset_core;
        begin
            @(negedge clk);reset=1;ir=0;mr=0;
            @(negedge clk);
            if(iv || mv || halted || retired || ia || lo || hi || error || z || c)
                $fatal(1,"reset did not clear state");
            reset=0;
        end
    endtask
    task send;
        input [31:0] word;
        begin
            while(!iv) @(negedge clk);
            instruction=word;ir=1;
            @(negedge clk);ir=0;
        end
    endtask
    task finish_instruction;
        begin
            while(!retired) @(negedge clk);
        end
    endtask
    initial begin
        reset_core;
        repeat(3) @(negedge clk);
        if(!iv || ia || retired) $fatal(1,"fetch stall");
        reset_core;
        send(32'h2800ffff);finish_instruction;
        if(ia!==16'hffff) $fatal(1,"jump address");
        send(0);finish_instruction;
        if(ia!==0 || rpc!==16'hffff) $fatal(1,"PC wrap");
        send(32'h04000001);finish_instruction;
        send(32'h24010001);
        while(!mv) @(negedge clk);
        repeat(4) begin
            @(negedge clk);
            if(!mv || !mw || ma!==1 || retired) $fatal(1,"store wait");
        end
        reset_core;
        send(32'h34000000);
        repeat(5) @(negedge clk);
        reset_core;
        send(32'h14000000);finish_instruction;
        if(!rw || rd!==0 || !z || c) $fatal(1,"registers not reset");
        send(32'h30000000);finish_instruction;
        if(!halted) $fatal(1,"halt");
        reset_core;
        send(32'h04000001);finish_instruction;
        if(!rw || rd!==1) $fatal(1,"restart");
        $display("PASS control reset/stall/PC-wrap");$finish;
    end
    initial begin #100000; $fatal(1,"timeout");end
endmodule
