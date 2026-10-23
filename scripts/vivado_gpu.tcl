# SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
# Out-of-context compute fabric only. No MIG, PCIe, board pins, or bitstream.
set root [file normalize [file join [file dirname [info script]] ..]]
set out [file join $root build vivado-gpu]
file mkdir $out
set part xc7a200tfbg484-2
set period 20.0
set cores 4
set lanes 16
if {[llength $argv] > 0} {set period [lindex $argv 0]}
if {[llength $argv] > 1} {set cores [lindex $argv 1]}
if {[llength $argv] > 2} {set lanes [lindex $argv 2]}
if {$period <= 0} {error "Clock period must be positive"}
if {![string is integer -strict $cores] || $cores < 1 || ![string is integer -strict $lanes] || $lanes < 1} {error "Core and lane counts must be positive integers"}
set_param general.maxThreads 4
create_project -in_memory -part $part
set f [open [file join $root rtl files.f] r]
foreach line [split [read $f] "\n"] {
    if {[string trim $line] ne ""} {read_verilog [file join $root [string trim $line]]}
}
close $f
set xdc [open [file join $out compute.xdc] w]
puts $xdc [format {create_clock -name compute_clk -period %s [get_ports clk]} $period]
puts $xdc {set_clock_uncertainty 0.2 [get_clocks compute_clk]}
puts $xdc {set_input_delay 2.0 -clock compute_clk [get_ports -filter {DIRECTION == IN && NAME != clk}]}
puts $xdc {set_output_delay 2.0 -clock compute_clk [all_outputs]}
close $xdc
read_xdc [file join $out compute.xdc]
synth_design -top milku_gpu -part $part -mode out_of_context -flatten_hierarchy rebuilt -generic [list CORES=$cores LANES=$lanes]
set_operating_conditions -grade industrial
set dsp_count [llength [get_cells -hier -filter {REF_NAME == DSP48E1}]]
if {$dsp_count < $cores*$lanes} {error "DSP multiplier mapping missing: $dsp_count DSP48E1 cells"}
puts "MILKU_DSP48E1_COUNT $dsp_count"
report_utilization -file [file join $out utilization-synth.rpt]
report_utilization -hierarchical -file [file join $out hierarchy-synth.rpt]
report_timing_summary -file [file join $out timing-synth.rpt]
write_checkpoint -force [file join $out gpu-synth.dcp]
if {[llength [get_cells -hier -filter {IS_BLACKBOX == 1}]] != 0} {error "Unexpected black boxes"}
opt_design
place_design
phys_opt_design
route_design
report_utilization -file [file join $out utilization-route.rpt]
report_utilization -hierarchical -file [file join $out hierarchy-route.rpt]
report_timing_summary -delay_type min_max -report_unconstrained -file [file join $out timing-route.rpt]
report_route_status -file [file join $out route-status.rpt]
report_drc -file [file join $out drc-route.rpt]
write_checkpoint -force [file join $out gpu-route.dcp]
set f [open [file join $out run-info.txt] w]
puts $f "Vivado [version -short]\nPart $part\nTop milku_gpu\nCORES $cores\nLANES $lanes\nClock period $period ns\nI/O delay 2.0 ns\nClock uncertainty 0.2 ns\nMode out_of_context; excludes MIG/DDR, PCIe, board pins"
puts $f "Worst setup slack [get_property SLACK [get_timing_paths -delay_type max -max_paths 1]]"
puts $f "Worst hold slack [get_property SLACK [get_timing_paths -delay_type min -max_paths 1]]"
close $f
puts "MILKU_GPU_ROUTE_COMPLETE"
