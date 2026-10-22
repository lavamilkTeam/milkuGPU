# SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
IVERILOG ?= iverilog
VVP ?= vvp
YOSYS ?= yosys
IVERILOG_FLAGS ?=

.PHONY: check boundaries test synth clean
check: boundaries test
boundaries:
	python3 scripts/check_boundaries.py
test:
	IVERILOG="$(IVERILOG)" VVP="$(VVP)" IVERILOG_FLAGS="$(IVERILOG_FLAGS)" sh scripts/test.sh
synth:
	YOSYS="$(YOSYS)" sh scripts/synth.sh
clean:
	rm -rf build
