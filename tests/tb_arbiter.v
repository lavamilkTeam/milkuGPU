// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
`timescale 1ns/1ps
module tb_arbiter;
    parameter CLIENTS=3;
    reg clk=0;
    always #5 clk=~clk;
    reg reset=1,mr=0;
    reg [CLIENTS-1:0] valid=0;
    wire [CLIENTS-1:0] ready;
    reg [CLIENTS*16-1:0] addresses=0;
    reg [CLIENTS*32-1:0] data=0;
    wire mv,mw;
    wire [15:0] ma;
    wire [31:0] wd,rd;
    integer i,owner,transactions=0;
    milku_arbiter #(.CLIENTS(CLIENTS)) dut (
        .clk(clk),.reset(reset),.request_valid(valid),.request_ready(ready),
        .request_write({CLIENTS{1'b1}}),.request_address(addresses),.request_data(data),
        .response_data(rd),.memory_valid(mv),.memory_ready(mr),.memory_write(mw),
        .memory_address(ma),.memory_write_data(wd),.memory_read_data(32'habcdef01)
    );
    initial begin
        for(i=0;i<CLIENTS;i=i+1) begin addresses[i*16 +: 16]=i;data[i*32 +: 32]=100+i;end
        repeat(2) @(negedge clk);reset=0;
        valid[CLIENTS-1]=1;
        wait(mv);@(negedge clk);
        valid={CLIENTS{1'b1}}; // A late request must not steal the stalled grant.
        repeat(5) begin
            @(negedge clk);
            if(!mv || ma!==CLIENTS-1 || wd!==99+CLIENTS || ready) $fatal(1,"grant not locked");
        end
        mr=1;owner=CLIENTS-1;
        // Continuously pending clients must all receive round-robin service.
        while(transactions<CLIENTS*5) begin
            @(posedge clk);
            if(mv && mr) begin
                if(ma!==owner || wd!==100+owner || !mw || rd!==32'habcdef01 ||
                   ready!==({{(CLIENTS-1){1'b0}},1'b1}<<owner)) $fatal(1,"arbitration order/response");
                transactions=transactions+1;
                owner=(owner+1)%CLIENTS;
            end
        end
        @(negedge clk);mr=0;
        wait(mv);@(negedge clk);reset=1;valid=0;
        @(negedge clk);
        if(mv || ready) $fatal(1,"reset did not cancel grant");
        reset=0;mr=1;
        repeat(4) begin @(negedge clk);if(mv || ready) $fatal(1,"stale grant");end
        $display("PASS arbiter CLIENTS=%0d locked grant/fairness/reset",CLIENTS);$finish;
    end
    initial begin #100000;$fatal(1,"arbiter timeout");end
endmodule
