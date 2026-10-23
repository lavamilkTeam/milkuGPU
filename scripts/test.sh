#!/bin/sh
# SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
set -eu
mkdir -p build
for width in 32; do
    for bench in core muldiv control regfile; do
        # IVERILOG_FLAGS is an optional, whitespace-separated list of compiler flags.
        ${IVERILOG:-iverilog} ${IVERILOG_FLAGS:-} -g2012 -Wall -Wno-timescale \
            -s "tb_$bench" \
            -o "build/$bench$width.vvp" -c rtl/files.f "tests/tb_$bench.v"
        ${VVP:-vvp} "build/$bench$width.vvp"
    done
    ${IVERILOG:-iverilog} ${IVERILOG_FLAGS:-} -g2012 -Wall -Wno-timescale \
        -s tb_core -P tb_core.STALLS=0 \
        -o "build/core${width}_nostalls.vvp" -c rtl/files.f tests/tb_core.v
    ${VVP:-vvp} "build/core${width}_nostalls.vvp"
done
