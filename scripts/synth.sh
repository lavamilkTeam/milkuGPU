#!/bin/sh
# SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
set -eu
mkdir -p build
for width in 32; do
    ${YOSYS:-yosys} -Q -T -p "
        read_verilog rtl/lavaneko_alu.v rtl/lavaneko_regfile.v rtl/lavaneko_muldiv.v rtl/lavaneko_core.v;
        hierarchy -check -top lavaneko_core;
        synth -top lavaneko_core -noabc;
        check -assert;
        select -assert-none t:\$dlatch t:\$_DLATCH_*;
        stat;
        write_json build/core$width.json
    " > "build/synth$width.log"
    echo "PASS synthesis WIDTH=$width (generic cells, not FPGA timing)"
done
