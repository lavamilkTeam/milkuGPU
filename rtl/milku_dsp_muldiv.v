// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
// DSP-inferred 32-bit multiply; restoring division remains iterative logic.
module milku_dsp_muldiv #(
    parameter WIDTH=32
) (
    input wire clk, reset, request_valid,
    output wire request_ready,
    input wire divide, signed_mode,
    input wire [WIDTH-1:0] a,b,
    output wire result_valid,
    input wire result_ready,
    output reg [WIDTH-1:0] lo,hi,
    output reg [1:0] error
);
    localparam IDLE=0, MUL_EXEC=1, MUL_FINISH=2, DIV_RUN=3, DIV_FINISH=4, DONE=5;
    reg [2:0] state;
    reg signed [WIDTH:0] multiply_a,multiply_b;
    // Extra sign bit permits both unsigned and signed full-width inputs.
    (* use_dsp = "yes" *) reg signed [2*WIDTH+1:0] product;
    reg [WIDTH-1:0] divisor,quotient;
    reg [WIDTH:0] remainder;
    reg [6:0] remaining;
    reg negative_result,negative_remainder;
    wire negative_a=signed_mode && a[WIDTH-1];
    wire negative_b=signed_mode && b[WIDTH-1];
    wire [WIDTH-1:0] magnitude_a=negative_a ? (~a+1'b1) : a;
    wire [WIDTH-1:0] magnitude_b=negative_b ? (~b+1'b1) : b;
    wire [WIDTH:0] shifted_remainder={remainder[WIDTH-1:0],quotient[WIDTH-1]};
    wire can_subtract=shifted_remainder>={1'b0,divisor};
    assign request_ready=!reset && state==IDLE;
    assign result_valid=!reset && state==DONE;
    always @(posedge clk) begin
        if(reset) begin
            state<=IDLE;multiply_a<=0;multiply_b<=0;product<=0;
            divisor<=0;quotient<=0;remainder<=0;remaining<=0;
            negative_result<=0;negative_remainder<=0;lo<=0;hi<=0;error<=0;
        end else case(state)
            IDLE: if(request_valid) begin
                error<=0;
                if(divide) begin
                    divisor<=magnitude_b;quotient<=magnitude_a;remainder<=0;remaining<=WIDTH;
                    negative_result<=negative_a ^ negative_b;negative_remainder<=negative_a;
                    state<=DIV_RUN;
                    if(b==0) begin error<=1;state<=DIV_FINISH;end
                    else if(signed_mode && a=={1'b1,{(WIDTH-1){1'b0}}} && b=={WIDTH{1'b1}}) begin
                        error<=2;state<=DIV_FINISH;
                    end
                end else begin
                    multiply_a<={negative_a,a};multiply_b<={negative_b,b};state<=MUL_EXEC;
                end
            end
            MUL_EXEC: begin product<=multiply_a*multiply_b;state<=MUL_FINISH;end
            MUL_FINISH: begin lo<=product[WIDTH-1:0];hi<=product[2*WIDTH-1:WIDTH];state<=DONE;end
            DIV_RUN: begin
                remainder<=can_subtract ? shifted_remainder-{1'b0,divisor} : shifted_remainder;
                quotient<={quotient[WIDTH-2:0],can_subtract};
                remaining<=remaining-1'b1;
                if(remaining==1) state<=DIV_FINISH;
            end
            DIV_FINISH: begin
                if(error!=0) begin lo<=0;hi<=0;end
                else begin
                    lo<=negative_result ? (~quotient+1'b1) : quotient;
                    hi<=negative_remainder ? (~remainder[WIDTH-1:0]+1'b1) : remainder[WIDTH-1:0];
                end
                state<=DONE;
            end
            DONE: if(result_ready) state<=IDLE;
            default: state<=IDLE;
        endcase
    end
endmodule
