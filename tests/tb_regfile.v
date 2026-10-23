// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
`timescale 1ns/1ps
module tb_regfile;
    parameter WIDTH = 32;
    reg clk=0;
    always #5 clk=~clk;
    reg reset=1, write_enable=0;
    reg [4:0] read_a=0,read_b=0,write_address=0;
    reg [WIDTH-1:0] write_data=0;
    wire [WIDTH-1:0] data_a,data_b;
    reg [WIDTH-1:0] expected [0:31];
    integer i,j;
    lavaneko_regfile #(.WIDTH(WIDTH)) dut (
        .clk(clk),.reset(reset),.read_a(read_a),.read_b(read_b),
        .data_a(data_a),.data_b(data_b),.write_enable(write_enable),
        .write_address(write_address),.write_data(write_data)
    );
    task check_all;
        begin
            for(i=0;i<32;i=i+1)for(j=0;j<32;j=j+1) begin
                read_a=i;read_b=j;#1;
                if(data_a !== expected[i] || data_b !== expected[j])
                    $fatal(1,"register alias/reset mismatch: a=%0d b=%0d",i,j);
            end
        end
    endtask
    initial begin
        for(i=0;i<32;i=i+1)expected[i]=0;
        repeat(2) @(negedge clk);reset=0;
        check_all;
        for(i=0;i<32;i=i+1) begin
            @(negedge clk);
            write_enable=1;write_address=i;write_data=32'h91c80000+i*257+1;
            expected[i]=write_data;
        end
        @(negedge clk);write_enable=0;check_all;
        @(negedge clk);
        read_a=31;read_b=31;write_enable=1;write_address=31;write_data='habcd;
        #1;
        if(data_a !== expected[31] || data_b !== expected[31]) $fatal(1,"pre-write read");
        @(negedge clk);write_enable=0;expected[31]='habcd;check_all;
        @(negedge clk);write_address=0;write_data='hffff;
        @(negedge clk);check_all;
        @(negedge clk);reset=1;write_enable=1;
        @(negedge clk);reset=0;write_enable=0;
        for(i=0;i<32;i=i+1)expected[i]=0;
        check_all;
        $display("PASS regfile WIDTH=%0d 32 registers, all read pairs, reset priority",WIDTH);$finish;
    end
endmodule
