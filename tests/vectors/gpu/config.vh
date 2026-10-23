localparam WORDS0=1516, STEPS0=1520;
localparam WORDS1=1516, STEPS1=1523;
localparam WORDS2=1516, STEPS2=1526;
localparam WORDS3=1516, STEPS3=1529;
localparam MAX_STEPS=1529, VECTOR_CORES=4;
function integer program_words;
input integer core;
begin
case(core)
0: program_words=1516;
1: program_words=1516;
2: program_words=1516;
3: program_words=1516;
default: program_words=0;
endcase
end
endfunction
function integer trace_steps;
input integer core;
begin
case(core)
0: trace_steps=1520;
1: trace_steps=1523;
2: trace_steps=1526;
3: trace_steps=1529;
default: trace_steps=0;
endcase
end
endfunction
