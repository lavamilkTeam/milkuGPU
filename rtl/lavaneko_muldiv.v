// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
module lavaneko_muldiv #(
    parameter WIDTH = 32
) (
    input wire clk,
    input wire reset,
    input wire request_valid,
    output wire request_ready,
    input wire divide,
    input wire signed_mode,
    input wire [WIDTH-1:0] a,
    input wire [WIDTH-1:0] b,
    output wire result_valid,
    input wire result_ready,
    output reg [WIDTH-1:0] lo,
    output reg [WIDTH-1:0] hi,
    output reg [1:0] error
);
    localparam IDLE = 2'd0, RUN = 2'd1, FINISH = 2'd2, DONE = 2'd3;
    reg [1:0] state;
    reg is_divide, negative_result, negative_remainder;
    reg [WIDTH-1:0] divisor, quotient;
    reg [WIDTH:0] remainder;
    reg [2*WIDTH-1:0] product, multiplicand;
    reg [6:0] remaining;
    wire negative_a = signed_mode && a[WIDTH-1];
    wire negative_b = signed_mode && b[WIDTH-1];
    wire [WIDTH-1:0] magnitude_a = negative_a ? (~a + 1'b1) : a;
    wire [WIDTH-1:0] magnitude_b = negative_b ? (~b + 1'b1) : b;
    wire [WIDTH:0] shifted_remainder = {remainder[WIDTH-1:0], quotient[WIDTH-1]};
    wire can_subtract = shifted_remainder >= {1'b0, divisor};
    wire [2*WIDTH-1:0] signed_product = negative_result ? (~product + 1'b1) : product;
    assign request_ready = (state == IDLE) && !reset;
    assign result_valid = (state == DONE) && !reset;

    always @(posedge clk) begin
        if (reset) begin
            state <= IDLE;
            is_divide <= 0;
            negative_result <= 0;
            negative_remainder <= 0;
            divisor <= 0;
            quotient <= 0;
            remainder <= 0;
            product <= 0;
            multiplicand <= 0;
            remaining <= 0;
            lo <= 0;
            hi <= 0;
            error <= 0;
        end else begin
            case (state)
                IDLE: if (request_valid) begin
                    is_divide <= divide;
                    negative_result <= negative_a ^ negative_b;
                    negative_remainder <= negative_a;
                    divisor <= magnitude_b;
                    quotient <= divide ? magnitude_a : magnitude_b;
                    remainder <= 0;
                    product <= 0;
                    multiplicand <= {{WIDTH{1'b0}}, magnitude_a};
                    remaining <= WIDTH;
                    error <= 0;
                    state <= RUN;
                    if (divide && b == 0) begin
                        error <= 1;
                        state <= FINISH;
                    end else if (divide && signed_mode &&
                                 a == {1'b1, {(WIDTH-1){1'b0}}} &&
                                 b == {WIDTH{1'b1}}) begin
                        error <= 2;
                        state <= FINISH;
                    end
                end
                RUN: begin
                    if (is_divide) begin
                        remainder <= can_subtract ? shifted_remainder - {1'b0, divisor}
                                                  : shifted_remainder;
                        quotient <= {quotient[WIDTH-2:0], can_subtract};
                    end else begin
                        if (quotient[0]) product <= product + multiplicand;
                        multiplicand <= multiplicand << 1;
                        quotient <= quotient >> 1;
                    end
                    remaining <= remaining - 1'b1;
                    if (remaining == 1) state <= FINISH;
                end
                FINISH: begin
                    if (error != 0) begin
                        lo <= 0;
                        hi <= 0;
                    end else if (is_divide) begin
                        lo <= negative_result ? (~quotient + 1'b1) : quotient;
                        hi <= negative_remainder ? (~remainder[WIDTH-1:0] + 1'b1)
                                                 : remainder[WIDTH-1:0];
                    end else begin
                        lo <= signed_product[WIDTH-1:0];
                        hi <= signed_product[2*WIDTH-1:WIDTH];
                    end
                    state <= DONE;
                end
                DONE: if (result_ready) state <= IDLE;
                default: state <= IDLE;
            endcase
        end
    end
endmodule
