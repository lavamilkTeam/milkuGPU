// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
module lavaneko_core #(
    parameter WIDTH = 32
) (
    input wire clk,
    input wire reset,
    output wire instruction_valid,
    input wire instruction_ready,
    output wire [15:0] instruction_address,
    input wire [WIDTH+15:0] instruction_data,
    output wire memory_valid,
    input wire memory_ready,
    output wire memory_write,
    output wire [15:0] memory_address,
    output wire [WIDTH-1:0] memory_write_data,
    input wire [WIDTH-1:0] memory_read_data,
    output wire halted,
    output reg flag_zero,
    output reg flag_carry,
    output reg [WIDTH-1:0] result_lo,
    output reg [WIDTH-1:0] result_hi,
    output reg [1:0] md_error,
    output reg retire_valid,
    output reg [15:0] retire_pc,
    output reg [WIDTH+15:0] retire_instruction,
    output reg retire_write,
    output reg [1:0] retire_destination,
    output reg [WIDTH-1:0] retire_data
);
    localparam FETCH = 3'd0, EXECUTE = 3'd1, MEMORY = 3'd2,
               MULDIV = 3'd3, STOPPED = 3'd4;
    reg [2:0] state;
    reg [15:0] pc;
    reg [WIDTH+15:0] instruction;
    wire [15:0] control = instruction[15:0];
    wire [WIDTH-1:0] immediate = instruction[WIDTH+15:16];
    wire extended = (control[7:6] == 2'b11);
    wire md_operation = extended && (control[7:0] <= 8'hc3);
    wire md_read = extended && (control[7:0] >= 8'hc4) && (control[7:0] <= 8'hc6);
    wire stop = !extended && control[6];
    wire has_memory = control[2] || control[3];
    wire normal_commit = !reset && !extended && !stop &&
                         (((state == EXECUTE) && !has_memory) ||
                          ((state == MEMORY) && memory_ready));
    wire extended_commit = !reset && (state == EXECUTE) && extended && !md_operation;
    wire stop_commit = !reset && (state == EXECUTE) && stop;
    wire md_valid, md_ready, md_request_ready;
    wire [WIDTH-1:0] md_lo, md_hi;
    wire [1:0] md_result_error;
    wire md_commit = !reset && (state == MULDIV) && md_valid;
    wire commit = normal_commit || extended_commit || stop_commit || md_commit;
    wire [WIDTH-1:0] register_a, register_b;
    wire [WIDTH-1:0] operand_a = control[7] ? register_a : immediate;
    wire [WIDTH-1:0] operand_b = control[5] ? {WIDTH{1'b0}} : register_b;
    wire [WIDTH-1:0] alu_result;
    wire alu_carry, alu_zero;
    wire [WIDTH-1:0] extension_data = control[7:0] == 8'hc4 ? result_lo :
                                     control[7:0] == 8'hc5 ? result_hi :
                                     {{(WIDTH-2){1'b0}}, md_error};
    wire register_write = (normal_commit && control[1]) ||
                          (extended_commit && md_read) ||
                          (md_commit && md_result_error == 0);
    wire [WIDTH-1:0] writeback = md_commit ? md_lo :
                                 extended_commit ? extension_data :
                                 control[2] ? memory_read_data : alu_result;
    wire [15:0] next_pc = !extended && (control[4] || (control[15] && flag_zero))
                         ? immediate[15:0] : pc + 16'd1;

    assign instruction_valid = (state == FETCH) && !reset;
    assign instruction_address = pc;
    assign memory_valid = (state == MEMORY) && !reset;
    assign memory_write = control[3];
    assign memory_address = immediate[15:0];
    assign memory_write_data = register_b;
    assign halted = (state == STOPPED) && !reset;
    assign md_ready = (state == MULDIV) && !reset;

    lavaneko_regfile #(.WIDTH(WIDTH)) registers (
        .clk(clk), .reset(reset), .read_a(control[13:12]), .read_b(control[9:8]),
        .data_a(register_a), .data_b(register_b), .write_enable(register_write),
        .write_address(control[11:10]), .write_data(writeback)
    );
    lavaneko_alu #(.WIDTH(WIDTH)) alu (
        .a(operand_a), .b(operand_b), .subtract(control[0]),
        .result(alu_result), .carry(alu_carry), .zero(alu_zero)
    );
    lavaneko_muldiv #(.WIDTH(WIDTH)) muldiv (
        .clk(clk), .reset(reset),
        .request_valid((state == EXECUTE) && md_operation && !reset),
        .request_ready(md_request_ready), .divide(control[1]), .signed_mode(control[0]),
        .a(register_a), .b(register_b), .result_valid(md_valid), .result_ready(md_ready),
        .lo(md_lo), .hi(md_hi), .error(md_result_error)
    );

    always @(posedge clk) begin
        if (reset) begin
            state <= FETCH;
            pc <= 0;
            instruction <= 0;
            flag_zero <= 0;
            flag_carry <= 0;
            result_lo <= 0;
            result_hi <= 0;
            md_error <= 0;
            retire_valid <= 0;
            retire_pc <= 0;
            retire_instruction <= 0;
            retire_write <= 0;
            retire_destination <= 0;
            retire_data <= 0;
        end else begin
            retire_valid <= commit;
            retire_write <= register_write;
            if (commit) begin
                retire_pc <= pc;
                retire_instruction <= instruction;
                retire_destination <= control[11:10];
                retire_data <= register_write ? writeback : {WIDTH{1'b0}};
                if (!stop_commit) pc <= next_pc;
                if (normal_commit && control[14]) begin
                    flag_zero <= alu_zero;
                    flag_carry <= alu_carry;
                end
                if (md_commit) begin
                    result_lo <= md_lo;
                    result_hi <= md_hi;
                    md_error <= md_result_error;
                end
            end
            case (state)
                FETCH: if (instruction_ready) begin
                    instruction <= instruction_data;
                    state <= EXECUTE;
                end
                EXECUTE: begin
                    if (stop) state <= STOPPED;
                    else if (md_operation) begin
                        if (md_request_ready) state <= MULDIV;
                    end else if (!extended && has_memory) state <= MEMORY;
                    else state <= FETCH;
                end
                MEMORY: if (memory_ready) state <= FETCH;
                MULDIV: if (md_valid) state <= FETCH;
                STOPPED: state <= STOPPED;
                default: state <= FETCH;
            endcase
        end
    end
endmodule
