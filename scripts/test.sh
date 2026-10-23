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

for cores in 2 4; do
    ${IVERILOG:-iverilog} ${IVERILOG_FLAGS:-} -g2012 -Wall -Wno-timescale \
        -s tb_gpu_control -P tb_gpu_control.CORES=$cores \
        -o "build/gpu_control_$cores.vvp" -c rtl/files.f tests/tb_gpu_control.v
    ${VVP:-vvp} "build/gpu_control_$cores.vvp"
    for stalls in 0 1; do
        ${IVERILOG:-iverilog} ${IVERILOG_FLAGS:-} -g2012 -Wall -Wno-timescale \
            -s tb_gpu -P tb_gpu.CORES=$cores -P tb_gpu.STALLS=$stalls \
            -o "build/gpu_${cores}_${stalls}.vvp" -c rtl/files.f tests/tb_gpu.v
        ${VVP:-vvp} "build/gpu_${cores}_${stalls}.vvp"
    done
done
for clients in 1 3 4; do
    ${IVERILOG:-iverilog} ${IVERILOG_FLAGS:-} -g2012 -Wall -Wno-timescale \
        -s tb_arbiter -P tb_arbiter.CLIENTS=$clients -o build/arbiter$clients.vvp \
        -c rtl/files.f tests/tb_arbiter.v
    ${VVP:-vvp} build/arbiter$clients.vvp
done

${IVERILOG:-iverilog} ${IVERILOG_FLAGS:-} -g2012 -Wall -Wno-timescale \
    -s tb_muldiv -P tb_muldiv.DSP=1 -o build/muldiv_dsp.vvp -c rtl/files.f tests/tb_muldiv.v
${VVP:-vvp} build/muldiv_dsp.vvp
