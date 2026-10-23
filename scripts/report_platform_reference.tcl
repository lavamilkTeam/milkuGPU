# SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
# Read-only report of a separately supplied platform checkpoint; never integration proof.
if {[llength $argv] != 2} {error "Usage: checkpoint.dcp output-directory"}
set out [file normalize [lindex $argv 1]]
file mkdir $out
open_checkpoint [lindex $argv 0]
report_utilization -file [file join $out utilization.rpt]
report_utilization -hierarchical -file [file join $out hierarchy.rpt]
set f [open [file join $out source.txt] w]
puts $f "Checkpoint [file normalize [lindex $argv 0]]\nPart [get_property PART [current_design]]\nVivado [version -short]"
puts $f "Black boxes [llength [get_cells -hier -filter {IS_BLACKBOX == 1}]]"
close $f
