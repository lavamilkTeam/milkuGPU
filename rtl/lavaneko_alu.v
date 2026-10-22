// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
module lavaneko_alu #(
    parameter WIDTH = 32
) (
    input wire [WIDTH-1:0] a,
    input wire [WIDTH-1:0] b,
    input wire subtract,
    output wire [WIDTH-1:0] result,
    output wire carry,
    output wire zero
);
    wire [WIDTH:0] sum;
    assign sum = {1'b0, a} + {1'b0, (b ^ {WIDTH{subtract}})}
               + {{WIDTH{1'b0}}, subtract};
    assign result = sum[WIDTH-1:0];
    assign carry = sum[WIDTH];
    assign zero = (result == {WIDTH{1'b0}});
endmodule
