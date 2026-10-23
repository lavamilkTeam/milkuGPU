// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
// Execution state only; decoded command stays stable until completion.
module milku_lane #(
    parameter LANE_ID=0, CORE_ID=0
) (
    input wire clk, reset, issue,
    input wire [5:0] opcode,
    input wire [4:0] destination, source_a, source_b,
    input wire [31:0] immediate, task_id,
    output reg finished, completed_write,
    output reg [31:0] completed_data,
    output reg flag_zero, flag_carry,
    output wire memory_valid,
    input wire memory_ready,
    output wire memory_write,
    output wire [15:0] memory_address,
    output wire [31:0] memory_write_data,
    input wire [31:0] memory_read_data
);
    localparam LDI=6'h01, LUI=6'h02, ORI=6'h03, ADDI=6'h04,
        ADD=6'h05, SUB=6'h06, CMP=6'h07, LOAD=6'h08, STORE=6'h09,
        MULU=6'h0d, MUL=6'h0e, DIVU=6'h0f, DIV=6'h10,
        MFLO=6'h11, MFHI=6'h12, MDSTAT=6'h13,
        LANEID=6'h14, COREID=6'h15, TASKID=6'h16;
    localparam IDLE=0, EXECUTE=1, MEMORY=2, MULDIV=3;
    reg [1:0] state;
    reg [31:0] result_lo, result_hi;
    reg [1:0] md_error;
    wire [31:0] a,b,alu_result,md_lo,md_hi;
    wire alu_zero,alu_carry,md_ready,md_valid;
    wire [1:0] md_result_error;
    wire is_memory=(opcode==LOAD || opcode==STORE);
    wire is_muldiv=(opcode>=MULU && opcode<=DIV);
    wire arithmetic=(opcode==ADDI || opcode==ADD || opcode==SUB || opcode==CMP);
    wire normal_commit=(state==EXECUTE && !is_memory && !is_muldiv) ||
                       (state==MEMORY && memory_ready);
    wire md_commit=(state==MULDIV && md_valid);
    wire commit=!reset && (normal_commit || md_commit);
    wire normal_write=(opcode==LDI || opcode==LUI || opcode==ORI ||
        opcode==ADDI || opcode==ADD || opcode==SUB || opcode==LOAD ||
        opcode==MFLO || opcode==MFHI || opcode==MDSTAT ||
        opcode==LANEID || opcode==COREID || opcode==TASKID);
    wire write_enable=!reset && ((normal_commit && normal_write) ||
                                   (md_commit && md_result_error==0));
    reg [31:0] writeback;
    assign memory_valid=!reset && state==MEMORY;
    assign memory_write=opcode==STORE;
    assign memory_address=alu_result[15:0];
    assign memory_write_data=b;
    always @* begin
        case(opcode)
            LDI: writeback=immediate;
            LUI: writeback={immediate[15:0],16'b0};
            ORI: writeback=a | {16'b0,immediate[15:0]};
            LOAD: writeback=memory_read_data;
            MFLO: writeback=result_lo;
            MFHI: writeback=result_hi;
            MDSTAT: writeback={30'b0,md_error};
            LANEID: writeback=LANE_ID;
            COREID: writeback=CORE_ID;
            TASKID: writeback=task_id;
            default: writeback=alu_result;
        endcase
        if(md_commit) writeback=md_lo;
    end
    lavaneko_regfile #(.WIDTH(32)) registers (
        .clk(clk),.reset(reset),.read_a(source_a),.read_b(source_b),
        .data_a(a),.data_b(b),.write_enable(write_enable),
        .write_address(destination),.write_data(writeback)
    );
    lavaneko_alu #(.WIDTH(32)) alu (
        .a(a),.b((opcode==ADDI || is_memory) ? immediate : b),
        .subtract(opcode==SUB || opcode==CMP),.result(alu_result),
        .carry(alu_carry),.zero(alu_zero)
    );
    milku_dsp_muldiv #(.WIDTH(32)) muldiv (
        .clk(clk),.reset(reset),
        .request_valid(state==EXECUTE && is_muldiv && !reset),
        .request_ready(md_ready),.divide(opcode==DIVU || opcode==DIV),
        .signed_mode(opcode==MUL || opcode==DIV),.a(a),.b(b),
        .result_valid(md_valid),.result_ready(state==MULDIV && !reset),
        .lo(md_lo),.hi(md_hi),.error(md_result_error)
    );
    always @(posedge clk) begin
        if(reset) begin
            state<=IDLE;finished<=0;completed_write<=0;completed_data<=0;
            flag_zero<=0;flag_carry<=0;result_lo<=0;result_hi<=0;md_error<=0;
        end else begin
            finished<=commit;
            completed_write<=write_enable;
            if(commit) completed_data<=write_enable ? writeback : 32'b0;
            if(commit && normal_commit && arithmetic) begin
                flag_zero<=alu_zero;flag_carry<=alu_carry;
            end
            if(md_commit) begin
                result_lo<=md_lo;result_hi<=md_hi;md_error<=md_result_error;
            end
            case(state)
                IDLE: if(issue) state<=EXECUTE;
                EXECUTE: begin
                    if(is_memory) state<=MEMORY;
                    else if(is_muldiv) begin if(md_ready) state<=MULDIV;end
                    else state<=IDLE;
                end
                MEMORY: if(memory_ready) state<=IDLE;
                MULDIV: if(md_valid) state<=IDLE;
                default: state<=IDLE;
            endcase
        end
    end
endmodule
