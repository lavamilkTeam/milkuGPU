<div align="left">milku</div>

# Milku R32 核心

自定义 32 位定长指令集，32 个 32 位可写通用寄存器，20 个操作码。当前是单通道整数核心，尚无 SIMD、浮点、图形流水线或 Unity 支持。

![主数据通路](docs/architecture.svg)

[架构图 SVG](docs/architecture.svg) · [PNG](docs/architecture.png)

- [图解与指令集](docs/lavaneko.html) · [PDF](docs/lavaneko.pdf)
- [架构](docs/architecture.md) · [端口与握手](docs/interfaces.md)
- [验证结果与复现](docs/verification.md)
- [来源](THIRD_PARTY_NOTICES.md) · [许可范围](LICENSE-SCOPE.md)

```text
rtl/       核心、寄存器组、ALU、迭代乘除单元
tests/    Verilog 测试与R32 参考模型生成的固定向量
scripts/   检查、参考向量生成、综合与 Vivado 工程入口
docs/      中文文档、可编辑 HTML/SVG 和 PDF
```

```sh
make check  # Python 3、Icarus Verilog 12、vvp
make synth  # Yosys；通用综合，不代表器件时序通过
```

Vivado 工程需要完整器件型号，`200T` 本身不能确定封装和速度等级：

```sh
vivado -mode batch -source scripts/create_project.tcl -tclargs <完整器件型号>
```

该脚本只建立核心工程。外部存储器、主机接口、时钟约束和引脚约束须由集成工程提供；本仓库未生成可上板 bitstream。

旧 Lavaneko 兼容版保存在提交 `6f8f281`。当前版本重新定义了指令编码，旧程序需要重新编码；完整 32 位常数使用 LUI + ORI，访存支持基址加偏移。原始 Logisim 与旧四寄存器实现均可从 Git 历史恢复。
