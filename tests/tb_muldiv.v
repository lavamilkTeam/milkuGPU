// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
`timescale 1ns/1ps
module tb_muldiv;
    parameter WIDTH = 32;
    reg clk = 0;
    always #5 clk=~clk;
    reg reset = 1, request_valid = 0, divide = 0, signed_mode = 0, result_ready = 0;
    reg [WIDTH-1:0] a=0, b=0;
    wire request_ready, result_valid;
    wire [WIDTH-1:0] lo, hi;
    wire [1:0] error;
    reg [WIDTH-1:0] inputs [0:7];
    reg [31:0] rng=32'h12345678;
    integer i,j,k,checks=0;
    lavaneko_muldiv #(.WIDTH(WIDTH)) dut (
        .clk(clk),.reset(reset),.request_valid(request_valid),.request_ready(request_ready),
        .divide(divide),.signed_mode(signed_mode),.a(a),.b(b),.result_valid(result_valid),
        .result_ready(result_ready),.lo(lo),.hi(hi),.error(error)
    );
    task run;
        input [WIDTH-1:0] left,right;
        input is_division,is_signed;
        reg [WIDTH-1:0] expected_lo,expected_hi;
        reg [2*WIDTH-1:0] product;
        reg signed [2*WIDTH-1:0] signed_product;
        reg signed [WIDTH-1:0] signed_left,signed_right;
        reg [1:0] expected_error;
        integer latency;
        begin
            signed_left=left; signed_right=right;
            expected_error=0;
            expected_lo=0; expected_hi=0;
            if (is_division && right==0) expected_error=1;
            else if (is_division && is_signed && left=={1'b1,{(WIDTH-1){1'b0}}} && right=={WIDTH{1'b1}})
                expected_error=2;
            else if (is_division) begin
                if (is_signed) begin expected_lo=signed_left/signed_right; expected_hi=signed_left%signed_right; end
                else begin expected_lo=left/right; expected_hi=left%right; end
            end else begin
                if (is_signed) begin signed_product=signed_left*signed_right; {expected_hi,expected_lo}=signed_product; end
                else begin product=left*right; {expected_hi,expected_lo}=product; end
            end
            @(negedge clk);
            if (!request_ready) $fatal(1,"unit not ready");
            a=left;b=right;divide=is_division;signed_mode=is_signed;request_valid=1;
            @(negedge clk);
            request_valid=0;
            a=~left;b=~right;divide=~is_division;signed_mode=~is_signed;
            latency=1;
            while (!result_valid) begin
                @(negedge clk);latency=latency+1;
                if(latency>WIDTH+3) $fatal(1,"muldiv timeout");
            end
            if(latency !== (expected_error ? 2 : WIDTH+2)) $fatal(1,"wrong latency %0d",latency);
            if ({error,hi,lo} !== {expected_error,expected_hi,expected_lo})
                $fatal(1,"muldiv mismatch left=%h right=%h divide=%b signed=%b",left,right,is_division,is_signed);
            request_valid=1;
            repeat(3) begin
                @(negedge clk);
                if(!result_valid || request_ready || {error,hi,lo} !== {expected_error,expected_hi,expected_lo})
                    $fatal(1,"result changed under backpressure");
            end
            request_valid=0;result_ready=1;
            @(negedge clk);
            result_ready=0;
            if(result_valid || !request_ready) $fatal(1,"acknowledge failed");
            checks=checks+1;
        end
    endtask
    initial begin
        inputs[0]=0;inputs[1]=1;inputs[2]=2;inputs[3]=3;
        inputs[4]={WIDTH{1'b1}};inputs[5]={1'b1,{(WIDTH-1){1'b0}}};
        inputs[6]={1'b0,{(WIDTH-1){1'b1}}};inputs[7]=16'h9abc;
        repeat(2) @(negedge clk);reset=0;
        for(i=0;i<8;i=i+1)for(j=0;j<8;j=j+1)for(k=0;k<4;k=k+1)
            run(inputs[i],inputs[j],k[1],k[0]);
        for(i=0;i<400;i=i+1) begin
            rng=rng^(rng<<13);rng=rng^(rng>>17);rng=rng^(rng<<5);
            inputs[0]=rng;
            rng=rng^(rng<<13);rng=rng^(rng>>17);rng=rng^(rng<<5);
            run(inputs[0],rng,i[1],i[0]);
        end
        for(i=0;i<2;i=i+1) begin
            @(negedge clk);a=31;b=7;divide=i[0];request_valid=1;
            @(negedge clk);request_valid=0;
            repeat(5) @(negedge clk);
            reset=1;
            @(negedge clk);
            if(result_valid || lo || hi || error) $fatal(1,"reset during operation");
            reset=0;
            run(7,3,i[0],0);
        end
        @(negedge clk);a=5;b=3;request_valid=1;
        @(negedge clk);request_valid=0;
        wait(result_valid);
        @(negedge clk);reset=1;
        @(negedge clk);
        if(result_valid || lo || hi || error) $fatal(1,"reset pending result");
        reset=0;run(1,1,0,0);
        $display("PASS muldiv WIDTH=%0d operations=%0d",WIDTH,checks);$finish;
    end
endmodule
