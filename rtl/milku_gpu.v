// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
module milku_gpu #(
    parameter CORES=4, LANES=16
) (
    input wire clk, reset,
    input wire [CORES-1:0] launch_valid,
    output wire [CORES-1:0] launch_ready,
    input wire [CORES*16-1:0] launch_pc,
    input wire [CORES*LANES-1:0] launch_mask,
    input wire [CORES*32-1:0] launch_task_base,
    output wire [CORES-1:0] busy,done,fault,
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
    output wire [CORES-1:0] retire_valid,
    output wire [CORES*16-1:0] retire_pc,
    output wire [CORES*32-1:0] retire_instruction,
    output wire [CORES*LANES-1:0] retire_active,retire_write,
    output wire [CORES*LANES*32-1:0] retire_data
);
    wire [CORES-1:0] iv,ir,mv,mr,mw;
    wire [CORES*16-1:0] ia,ma;
    wire [CORES*32-1:0] wd;
    wire [31:0] idata,rdata;
    genvar c;
    generate for(c=0;c<CORES;c=c+1) begin: cores
        milku_simd_core #(.LANES(LANES),.CORE_ID(c)) core (
            .clk(clk),.reset(reset),.launch_valid(launch_valid[c]),.launch_ready(launch_ready[c]),
            .launch_pc(launch_pc[c*16 +: 16]),.launch_mask(launch_mask[c*LANES +: LANES]),
            .launch_task_base(launch_task_base[c*32 +: 32]),
            .busy(busy[c]),.done(done[c]),.fault(fault[c]),
            .instruction_valid(iv[c]),.instruction_ready(ir[c]),
            .instruction_address(ia[c*16 +: 16]),.instruction_data(idata),
            .memory_valid(mv[c]),.memory_ready(mr[c]),.memory_write(mw[c]),
            .memory_address(ma[c*16 +: 16]),.memory_write_data(wd[c*32 +: 32]),
            .memory_read_data(rdata),.retire_valid(retire_valid[c]),
            .retire_pc(retire_pc[c*16 +: 16]),.retire_instruction(retire_instruction[c*32 +: 32]),
            .retire_active(retire_active[c*LANES +: LANES]),
            .retire_write(retire_write[c*LANES +: LANES]),
            .retire_data(retire_data[c*LANES*32 +: LANES*32])
        );
    end endgenerate
    milku_arbiter #(.CLIENTS(CORES)) instruction_arbiter (
        .clk(clk),.reset(reset),.request_valid(iv),.request_ready(ir),
        .request_write({CORES{1'b0}}),.request_address(ia),.request_data({CORES*32{1'b0}}),
        .response_data(idata),.memory_valid(instruction_valid),.memory_ready(instruction_ready),
        .memory_write(),.memory_address(instruction_address),.memory_write_data(),
        .memory_read_data(instruction_data)
    );
    milku_arbiter #(.CLIENTS(CORES)) data_arbiter (
        .clk(clk),.reset(reset),.request_valid(mv),.request_ready(mr),.request_write(mw),
        .request_address(ma),.request_data(wd),.response_data(rdata),
        .memory_valid(memory_valid),.memory_ready(memory_ready),.memory_write(memory_write),
        .memory_address(memory_address),.memory_write_data(memory_write_data),
        .memory_read_data(memory_read_data)
    );
endmodule
