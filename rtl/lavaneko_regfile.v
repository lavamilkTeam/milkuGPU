// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
module lavaneko_regfile #(
    parameter WIDTH = 32
) (
    input wire clk,
    input wire reset,
    input wire [4:0] read_a,
    input wire [4:0] read_b,
    output wire [WIDTH-1:0] data_a,
    output wire [WIDTH-1:0] data_b,
    input wire write_enable,
    input wire [4:0] write_address,
    input wire [WIDTH-1:0] write_data
);
    reg [WIDTH-1:0] registers [0:31];
    integer i;
    assign data_a = registers[read_a];
    assign data_b = registers[read_b];
    always @(posedge clk) begin
        if (reset) begin
            for (i = 0; i < 32; i = i + 1)
                registers[i] <= {WIDTH{1'b0}};
        end else if (write_enable) begin
            registers[write_address] <= write_data;
        end
    end
endmodule
