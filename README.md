<div align="left">milku</div>

# Lavaneko Verilog 核心

Lavaneko 现有指令集的可综合 Verilog 实现，支持 16/32 位数据通路、四个通用寄存器和 18 条命名指令。当前是单通道整数 CPU 核心；尚无 SIMD、浮点、图形流水线、Linux 显卡驱动或 Unity 支持。

- [图解与指令集](docs/lavaneko.html) · [PDF](docs/lavaneko.pdf)
- [架构](docs/architecture.md) · [端口与握手](docs/interfaces.md)
- [验证结果与复现](docs/verification.md)
- [来源](THIRD_PARTY_NOTICES.md) · [许可范围](LICENSE-SCOPE.md)

```text
rtl/       核心、寄存器组、ALU、迭代乘除单元
tests/    Verilog 测试与上游参考模型生成的固定向量
scripts/   检查、参考向量生成、综合与 Vivado 工程入口
docs/      中文文档、可编辑 HTML/SVG 和 PDF
```

```sh
make check  # Python 3、Icarus Verilog 12、vvp
make synth  # Yosys；通用综合，不代表器件时序通过
```

Vivado 工程需要完整器件型号，`200T` 本身不能确定封装和速度等级：

```sh
vivado -mode batch -source scripts/create_project.tcl -tclargs <完整器件型号> 32
```

该脚本只建立核心工程。外部存储器、主机接口、时钟约束和引脚约束须由集成工程提供；本仓库未生成可上板 bitstream。

基线是 `lavamilkTeam/lavanekoCPU` 的 `8e249ae491903985db7ca79df683efa5b7946267`。保留其提交历史和指令结果语义；工作树移除 Logisim、桌面应用及预留编译工具链，新增 RTL 与必要验证脚本。旧工程可从基线提交恢复。
