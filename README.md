<div align="left">milku</div>

# Milku 并行计算核心

自定义 32 位定长指令集，默认 **4 核心 × 每核心 16 条 lane**。每条 lane 有 32 个 32 位寄存器、整数 ALU、DSP 乘法与迭代除法单元。每核心独立取指与译码，数据访问经过轮转仲裁。

![并行计算结构](docs/gpu-architecture.svg)

- [并行架构与指令扩展](docs/gpu.md) · [并行接口](docs/gpu-interfaces.md)
- [Vivado 资源与时序验证](docs/gpu-validation.md)
- [基础指令集与标量兼容核心](docs/architecture.md) · [标量接口](docs/interfaces.md)
- [标量图解 HTML](docs/lavaneko.html) · [标量图解 PDF](docs/lavaneko.pdf)
- [基础验证](docs/verification.md) · [来源](THIRD_PARTY_NOTICES.md) · [许可范围](LICENSE-SCOPE.md)

R32 SIMD v1 保留 20 条基础指令，增加 LANEID、COREID、TASKID。支持启动掩码、独立任务入口和任务编号。JZ 判断不一致会停止对应核心并报告 fault；尚无分歧恢复、浮点、缓存或图形流水线。

```sh
make check  # Python 3、Icarus Verilog 12、vvp
make synth  # Yosys 通用综合，不代表器件时序
vivado -mode batch -source scripts/vivado_gpu.tcl  # 4×16，xc7a200tfbg484-2，50 MHz OOC
```

`rtl/files.f` 是生产 RTL 清单。测试仅通过公开接口验证；`scripts/reference_vectors.py` 和 `scripts/gpu_vectors.py` 生成独立数学模型的固定向量。

4×16 已在 windev 的 Vivado 2024.2 完成 OOC 布局布线：84,302 LUT、89,137 触发器、256 DSP；50 MHz 在当前约束模型下通过时序检查。详细条件和警告见验证报告。

Vivado 脚本验证独立计算模块，尚未接入 DDR/MIG、PCIe/DMA 或主机驱动。保留 16 位字地址（每空间 256 KiB），没有可直接上板的 bitstream，也不能直接运行 CUDA 或 Unity 程序。

旧单通道入口 `lavaneko_core` 和其 20 指令语义保持兼容；旧四寄存器版本位于提交 `6f8f281`。完整历史、来源和许可保留。
