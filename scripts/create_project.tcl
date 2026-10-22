# SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
set root [file normalize [file join [file dirname [info script]] ..]]
if {[llength $argv] < 1} {
    error "Usage: vivado -mode batch -source scripts/create_project.tcl -tclargs <exact-part> ?width?"
}
set part [lindex $argv 0]
set width 32
if {[llength $argv] > 1} { set width [lindex $argv 1] }
if {$width ni {16 32}} { error "WIDTH must be 16 or 32" }
create_project milku [file join $root build vivado] -part $part -force
set stream [open [file join $root rtl files.f] r]
foreach line [split [read $stream] "\n"] {
    if {[string trim $line] ne ""} { add_files [file join $root [string trim $line]] }
}
close $stream
set_property top lavaneko_core [current_fileset]
set_property generic WIDTH=$width [current_fileset]
set_property target_language Verilog [current_project]
update_compile_order -fileset sources_1
puts "Created core-only project. Add memory/host adapters and clock constraints before implementation."
