// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
module milku_simd_core #(
    parameter LANES=16, CORE_ID=0
) (
    input wire clk, reset, launch_valid,
    output wire launch_ready,
    input wire [15:0] launch_pc,
    input wire [LANES-1:0] launch_mask,
    input wire [31:0] launch_task_base,
    output wire busy, done,
    output reg fault,
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
    output reg retire_valid,
    output reg [15:0] retire_pc,
    output reg [31:0] retire_instruction,
    output wire [LANES-1:0] retire_active,
    output reg [LANES-1:0] retire_write,
    output reg [LANES*32-1:0] retire_data
);
    localparam IDLE=0, FETCH=1, ISSUE=2, WAIT_LANES=3, COMMIT=4, STOPPED=5;
    reg [2:0] state;
    reg [15:0] pc;
    reg [31:0] instruction, task_base;
    reg [LANES-1:0] active, completed;
    wire accept_launch=launch_valid && launch_ready;
    wire lane_reset=reset || accept_launch;
    wire [5:0] opcode=instruction[31:26];
    wire [4:0] destination=instruction[25:21];
    wire [4:0] source_a=instruction[20:16];
    wire [4:0] source_b=(opcode==6'h09) ? destination : instruction[15:11];
    wire [31:0] immediate={{16{instruction[15]}},instruction[15:0]};
    wire [LANES-1:0] lane_finished,lane_write,lane_zero,lane_carry;
    wire [LANES*32-1:0] lane_data;
    wire [LANES-1:0] req_valid,req_ready,req_write;
    wire [LANES*16-1:0] req_address;
    wire [LANES*32-1:0] req_data;
    wire [31:0] response_data;
    wire any_zero=|(lane_zero & active);
    wire all_zero=((lane_zero & active)==active);
    wire divergent=(opcode==6'h0b && any_zero && !all_zero);
    assign launch_ready=!reset && (state==IDLE || state==STOPPED);
    assign busy=!reset && state!=IDLE && state!=STOPPED;
    assign done=!reset && state==STOPPED;
    assign instruction_valid=!reset && state==FETCH;
    assign instruction_address=pc;
    assign retire_active=active;
    genvar g;
    generate for(g=0;g<LANES;g=g+1) begin: lanes
        wire [31:0] lane_task_id=task_base+g;
        milku_lane #(.LANE_ID(g),.CORE_ID(CORE_ID)) lane (
            .clk(clk),.reset(lane_reset),.issue(state==ISSUE && active[g]),
            .opcode(opcode),.destination(destination),.source_a(source_a),
            .source_b(source_b),.immediate(immediate),.task_id(lane_task_id),
            .finished(lane_finished[g]),.completed_write(lane_write[g]),
            .completed_data(lane_data[g*32 +: 32]),
            .flag_zero(lane_zero[g]),.flag_carry(lane_carry[g]),
            .memory_valid(req_valid[g]),.memory_ready(req_ready[g]),
            .memory_write(req_write[g]),.memory_address(req_address[g*16 +: 16]),
            .memory_write_data(req_data[g*32 +: 32]),.memory_read_data(response_data)
        );
    end endgenerate
    milku_arbiter #(.CLIENTS(LANES)) memory_arbiter (
        .clk(clk),.reset(lane_reset),.request_valid(req_valid),.request_ready(req_ready),
        .request_write(req_write),.request_address(req_address),.request_data(req_data),
        .response_data(response_data),.memory_valid(memory_valid),.memory_ready(memory_ready),
        .memory_write(memory_write),.memory_address(memory_address),
        .memory_write_data(memory_write_data),.memory_read_data(memory_read_data)
    );
    integer i;
    always @(posedge clk) begin
        if(reset) begin
            state<=IDLE;pc<=0;instruction<=0;active<=0;completed<=0;task_base<=0;fault<=0;
            retire_valid<=0;retire_pc<=0;retire_instruction<=0;retire_write<=0;retire_data<=0;
        end else begin
            retire_valid<=0;
            if(accept_launch) begin
                pc<=launch_pc;active<=launch_mask;task_base<=launch_task_base;
                instruction<=0;completed<=0;fault<=0;retire_write<=0;retire_data<=0;
                state<=(launch_mask==0) ? STOPPED : FETCH;
            end else case(state)
                FETCH: if(instruction_ready) begin instruction<=instruction_data;state<=ISSUE;end
                ISSUE: begin completed<=0;retire_write<=0;retire_data<=0;state<=WAIT_LANES;end
                WAIT_LANES: begin
                    completed<=completed | lane_finished;
                    for(i=0;i<LANES;i=i+1) if(lane_finished[i] && active[i]) begin
                        retire_write[i]<=lane_write[i];
                        retire_data[i*32 +: 32]<=lane_data[i*32 +: 32];
                    end
                    if(((completed | lane_finished) & active)==active) state<=COMMIT;
                end
                COMMIT: begin
                    if(divergent) begin fault<=1;state<=STOPPED;end
                    else begin
                        retire_valid<=1;retire_pc<=pc;retire_instruction<=instruction;
                        if(opcode==6'h0c) state<=STOPPED;
                        else begin
                            pc<=(opcode==6'h0a || (opcode==6'h0b && all_zero)) ? instruction[15:0] : pc+16'd1;
                            state<=FETCH;
                        end
                    end
                end
                default: state<=state;
            endcase
        end
    end
endmodule
