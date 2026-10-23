// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
module lavaneko_core (
    input wire clk,
    input wire reset,
    output wire instruction_valid,
    input wire instruction_ready,
    output wire [15:0] instruction_address,
    input wire [31:0] instruction_data,
    output wire memory_valid,
    input wire memory_ready,
    output wire memory_write,
    output wire [15:0] memory_address,
    output wire [31:0] memory_write_data,
    input wire [31:0] memory_read_data,
    output wire halted,
    output reg flag_zero,
    output reg flag_carry,
    output reg [31:0] result_lo,
    output reg [31:0] result_hi,
    output reg [1:0] md_error,
    output reg retire_valid,
    output reg [15:0] retire_pc,
    output reg [31:0] retire_instruction,
    output reg retire_write,
    output reg [4:0] retire_destination,
    output reg [31:0] retire_data
);
    localparam NOP=6'h00, LDI=6'h01, LUI=6'h02, ORI=6'h03,
               ADDI=6'h04, ADD=6'h05, SUB=6'h06, CMP=6'h07,
               LOAD=6'h08, STORE=6'h09, JUMP=6'h0a, JZ=6'h0b,
               HALT=6'h0c, MULU=6'h0d, MUL=6'h0e, DIVU=6'h0f,
               DIV=6'h10, MFLO=6'h11, MFHI=6'h12, MDSTAT=6'h13;
    localparam FETCH=3'd0, EXECUTE=3'd1, MEMORY=3'd2,
               MULDIV=3'd3, STOPPED=3'd4;
    reg [2:0] state;
    reg [15:0] pc;
    reg [31:0] instruction;
    wire [5:0] opcode=instruction[31:26];
    wire [4:0] destination=instruction[25:21];
    wire [4:0] source_a=instruction[20:16];
    wire [4:0] source_b=(opcode==STORE) ? destination : instruction[15:11];
    wire [31:0] immediate={{16{instruction[15]}},instruction[15:0]};
    wire is_memory=(opcode==LOAD || opcode==STORE);
    wire is_muldiv=(opcode>=MULU && opcode<=DIV);
    wire is_arithmetic=(opcode==ADDI || opcode==ADD || opcode==SUB || opcode==CMP);
    wire alu_immediate=(opcode==ADDI || is_memory);
    wire [31:0] register_a,register_b,alu_result;
    wire alu_carry,alu_zero;
    wire md_valid,md_request_ready;
    wire [31:0] md_lo,md_hi;
    wire [1:0] md_result_error;
    wire md_commit=!reset && state==MULDIV && md_valid;
    wire normal_commit=!reset && ((state==EXECUTE && !is_memory && !is_muldiv)
                                     || (state==MEMORY && memory_ready));
    wire commit=normal_commit || md_commit;
    wire normal_write=(opcode==LDI || opcode==LUI || opcode==ORI ||
                       opcode==ADDI || opcode==ADD || opcode==SUB || opcode==LOAD ||
                       opcode==MFLO || opcode==MFHI || opcode==MDSTAT);
    wire register_write=(normal_commit && normal_write) ||
                        (md_commit && md_result_error==0);
    reg [31:0] writeback;
    wire [15:0] next_pc=(opcode==JUMP || (opcode==JZ && flag_zero))
                        ? instruction[15:0] : pc+16'd1;

    assign instruction_valid=(state==FETCH) && !reset;
    assign instruction_address=pc;
    assign memory_valid=(state==MEMORY) && !reset;
    assign memory_write=(opcode==STORE);
    assign memory_address=alu_result[15:0];
    assign memory_write_data=register_b;
    assign halted=(state==STOPPED) && !reset;

    always @* begin
        case(opcode)
            LDI: writeback=immediate;
            LUI: writeback={instruction[15:0],16'b0};
            ORI: writeback=register_a | {16'b0,instruction[15:0]};
            LOAD: writeback=memory_read_data;
            MFLO: writeback=result_lo;
            MFHI: writeback=result_hi;
            MDSTAT: writeback={30'b0,md_error};
            default: writeback=alu_result;
        endcase
        if(md_commit) writeback=md_lo;
    end

    lavaneko_regfile #(.WIDTH(32)) registers (
        .clk(clk),.reset(reset),.read_a(source_a),.read_b(source_b),
        .data_a(register_a),.data_b(register_b),.write_enable(register_write),
        .write_address(destination),.write_data(writeback)
    );
    lavaneko_alu #(.WIDTH(32)) alu (
        .a(register_a),.b(alu_immediate ? immediate : register_b),
        .subtract(opcode==SUB || opcode==CMP),.result(alu_result),
        .carry(alu_carry),.zero(alu_zero)
    );
    lavaneko_muldiv #(.WIDTH(32)) muldiv (
        .clk(clk),.reset(reset),
        .request_valid(state==EXECUTE && is_muldiv && !reset),
        .request_ready(md_request_ready),.divide(opcode==DIVU || opcode==DIV),
        .signed_mode(opcode==MUL || opcode==DIV),.a(register_a),.b(register_b),
        .result_valid(md_valid),.result_ready(state==MULDIV && !reset),
        .lo(md_lo),.hi(md_hi),.error(md_result_error)
    );

    always @(posedge clk) begin
        if(reset) begin
            state<=FETCH;pc<=0;instruction<=0;
            flag_zero<=0;flag_carry<=0;result_lo<=0;result_hi<=0;md_error<=0;
            retire_valid<=0;retire_pc<=0;retire_instruction<=0;
            retire_write<=0;retire_destination<=0;retire_data<=0;
        end else begin
            retire_valid<=commit;
            retire_write<=register_write;
            if(commit) begin
                retire_pc<=pc;retire_instruction<=instruction;
                retire_destination<=destination;
                retire_data<=register_write ? writeback : 32'b0;
                if(opcode!=HALT) pc<=next_pc;
                if(normal_commit && is_arithmetic) begin
                    flag_zero<=alu_zero;flag_carry<=alu_carry;
                end
                if(md_commit) begin
                    result_lo<=md_lo;result_hi<=md_hi;md_error<=md_result_error;
                end
            end
            case(state)
                FETCH: if(instruction_ready) begin instruction<=instruction_data;state<=EXECUTE;end
                EXECUTE: begin
                    if(opcode==HALT) state<=STOPPED;
                    else if(is_muldiv) begin if(md_request_ready) state<=MULDIV;end
                    else if(is_memory) state<=MEMORY;
                    else state<=FETCH;
                end
                MEMORY: if(memory_ready) state<=FETCH;
                MULDIV: if(md_valid) state<=FETCH;
                STOPPED: state<=STOPPED;
                default: state<=FETCH;
            endcase
        end
    end
endmodule
