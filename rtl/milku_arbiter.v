// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
// Registered round-robin grant; a stalled transaction cannot change owners.
module milku_arbiter #(
    parameter CLIENTS=2, ADDRESS_WIDTH=16, DATA_WIDTH=32,
    parameter INDEX_WIDTH=(CLIENTS>1 ? $clog2(CLIENTS) : 1)
) (
    input wire clk, reset,
    input wire [CLIENTS-1:0] request_valid,
    output reg [CLIENTS-1:0] request_ready,
    input wire [CLIENTS-1:0] request_write,
    input wire [CLIENTS*ADDRESS_WIDTH-1:0] request_address,
    input wire [CLIENTS*DATA_WIDTH-1:0] request_data,
    output wire [DATA_WIDTH-1:0] response_data,
    output wire memory_valid,
    input wire memory_ready,
    output wire memory_write,
    output wire [ADDRESS_WIDTH-1:0] memory_address,
    output wire [DATA_WIDTH-1:0] memory_write_data,
    input wire [DATA_WIDTH-1:0] memory_read_data
);
    reg granted;
    reg [INDEX_WIDTH-1:0] owner, next_owner;
    reg found;
    reg [INDEX_WIDTH-1:0] selected;
    integer k, candidate;
    always @* begin
        found=0;selected=0;candidate=0;
        for(k=0;k<CLIENTS;k=k+1) begin
            candidate=next_owner+k;
            if(candidate>=CLIENTS) candidate=candidate-CLIENTS;
            if(!found && request_valid[candidate]) begin
                found=1;selected=candidate;
            end
        end
        request_ready=0;
        if(memory_valid && memory_ready) request_ready[owner]=1;
    end
    assign memory_valid=!reset && granted && request_valid[owner];
    assign memory_write=request_write[owner];
    assign memory_address=request_address[owner*ADDRESS_WIDTH +: ADDRESS_WIDTH];
    assign memory_write_data=request_data[owner*DATA_WIDTH +: DATA_WIDTH];
    assign response_data=memory_read_data;
    always @(posedge clk) begin
        if(reset) begin granted<=0;owner<=0;next_owner<=0;end
        else if(!granted) begin
            if(found) begin owner<=selected;granted<=1;end
        end else if(memory_valid && memory_ready) begin
            granted<=0;
            next_owner<=(owner==CLIENTS-1) ? 0 : owner+1'b1;
        end
    end
endmodule
