create_clock -name compute_clk -period 20.0 [get_ports clk]
set_clock_uncertainty 0.2 [get_clocks compute_clk]
set_input_delay 2.0 -clock compute_clk [get_ports -filter {DIRECTION == IN && NAME != clk}]
set_output_delay 2.0 -clock compute_clk [all_outputs]
