milku

# 并行核心验证

## 配置

| 项目 | 实际配置 |
|---|---|
| FPGA | 用户器件 XC7A200T-2FBG484I；Vivado part 为 xc7a200tfbg484-2 |
| 工具 | windev / WIN10-GTX1650，Vivado 2024.2 |
| 顶层 | milku_gpu，CORES=4，LANES=16 |
| 运算 | 每 lane DSP 乘法、迭代除法、整数 ALU |
| 时钟目标 | 50 MHz，周期 20 ns |
| 接口时序假设 | 输入、输出延迟均 2 ns；时钟不确定度 0.2 ns |
| 实现方式 | Out-of-context，包含调试退休端口；不包含板级 I/O buffer |
| 外部系统 | 不包含指令/数据 RAM、DDR/MIG、PCIe/DMA、主机软件 |

7 系列的温度等级不拼入该 Vivado part 字符串；脚本设置 industrial 工作条件。此处不是热设计或工业温度环境实测。

## 功能

`make check` 与 `make synth` 已通过。原始输出见 [测试记录](reports/gpu-20261023/tests.txt)。

| 检查 | 结果 |
|---|---|
| 旧标量核心 | 有等待、无等待各 6,499 条退休指令全部匹配原参考模型 |
| 四核心程序 | 核心 0～3 分别 1,520、1,523、1,526、1,529 条退休指令；64 条 lane 独立匹配数学模型 |
| 有等待并行测试 | 全开掩码、部分掩码两次任务，共 54,986 拍、4,111 次写存储 |
| 无等待并行测试 | 两次任务共 37,823 拍、4,111 次写存储 |
| 存储 | 每次任务检查全部 65,536 个数据字，关闭的 lane 不写入 |
| 控制 | 分歧隔离、统一分支、零掩码、忙时启动拒绝、重启、取指/写存储/除法时复位、PC 回绕 |
| 乘除单元 | 原单元与 DSP 单元各 659 例；覆盖符号、边界、随机输入、错误、结果背压及复位 |
| 仲裁 | CLIENTS=1、3、4，以及整机的 2、4、16 路；锁定等待中的事务、轮转服务、取消复位前事务 |
| 构建 | RTL 模块边界、向量 SHA-256、Yosys 层次检查、无锁存器检查通过 |
| 向量复现 | 标量与 SIMD 向量重新生成后逐字节一致 |

2×16 回归也通过：有等待 36,137 拍、无等待 28,380 拍，各 2,086 次写存储。

并行测试覆盖全部基础指令、3 条身份指令、全部寄存器读索引和保留操作码。任务结束检查每 lane 的最终寄存器转存结果。测试只使用公开端口，不读取 DUT 内部层级。

## Vivado

**4×16 已完成综合与布局布线，资源可容纳；50 MHz 在本次 OOC 约束模型下通过时序检查。** 运行于 2026-10-23 11:45 完成。

| 资源 | 综合占用 | 布线后占用 | 本次布线可用量 | 布线后比例 |
|---|---:|---:|---:|---:|
| LUT | 86,133 | 84,302 | 133,800 | 63.01% |
| 触发器 | 89,120 | 89,137 | 267,600 | 33.31% |
| DSP48E1 | 256 | 256 | 740 | 34.59% |
| 36 Kb 块 RAM | 0 | 0 | 365 | 0% |

芯片标称总量为 134,600 LUT、269,200 触发器；本次布局布线报告将其中 800 LUT、1,600 触发器列为 Prohibited，上表比例按报告的可用量计算。每 lane 使用 4 个 DSP48E1。无黑盒。

| 最终检查 | 结果 |
|---|---|
| 建立时间 WNS / TNS | +1.305 ns / 0 ns |
| 保持时间 WHS / THS | +0.003 ns / 0 ns |
| 未约束内部端点、缺少输入/输出延迟 | 均为 0 |
| 可布线网络 | 164,018 条，全部完成 |
| 布线错误 | 0 |
| DRC | 无 Error / Critical Warning；385 条 Warning |

DRC 警告包括 128 条 PREG 和 256 条 MREG 流水线建议，以及 1 条未设置 CFGBVS / CONFIG_VOLTAGE。DSP 目前没有使用所有内部流水级；板级配置电压尚未纳入此计算模块工程。没有生成或下载 bitstream。

[布线资源](reports/gpu-20261023/utilization-route.rpt) · [布线层级](reports/gpu-20261023/hierarchy-route.rpt) · [最终时序](reports/gpu-20261023/timing-route.rpt) · [布线状态](reports/gpu-20261023/route-status.rpt) · [DRC](reports/gpu-20261023/drc-route.rpt) · [运行参数](reports/gpu-20261023/run-info.txt) · [时序约束](reports/gpu-20261023/compute.xdc)

[综合资源](reports/gpu-20261023/utilization-synth.rpt) · [综合层级](reports/gpu-20261023/hierarchy-synth.rpt) · [综合时序](reports/gpu-20261023/timing-synth.rpt)

本次是独立计算模块的 OOC 实现：未设置板级时钟源位置 `HD.CLK_SRC` 或接口位置 `HD.PARTPIN_LOCS`。Vivado 因此报告时钟延迟/偏斜和边界端口部分布线无法准确建模；OOC 也不会运行全部整卡连接 DRC。时序数字只适用于当前模型，不能作为连接 DDR、PCIe 和实际时钟树后的整卡时序闭合结论。

2×16 基线在 100 MHz 下综合占用 43,126 LUT、44,580 触发器、128 DSP，综合估算 WNS=-1.141 ns。确定采用 4×16 后停止了该基线的剩余布线优化；它没有完成布线时序验证。[基线资源](reports/gpu-20261023/2x16-utilization-synth.rpt) · [基线综合时序](reports/gpu-20261023/2x16-timing-synth.rpt) · [基线源码校验值](reports/gpu-20261023/source-sha256-2x16.json)

## DDR 与平台边界

用户给定的 MT41K256M16TW-107 属于 4 Gbit、x16 DDR3L 系列，单颗容量 512 MiB；用户已确认 4 颗、64 位总线，总容量 2 GiB。[Micron 器件资料](https://www.micron.com/products/memory/dram-components/ddr3-sdram/part-catalog/part-detail/mt41k256m16tw)

windev 上已有一个**独立平台参考工程**：MT41K256M16XX-107、64 位数据总线、MIG 400 MHz 存储时钟（800 MT/s）、1.5 V 配置，含 PCIe 示例与 DDR 测试逻辑。本次只读打开其已布线检查点，确认无黑盒并重新输出资源报告；没有将其与计算核心连接，也没有改动该工程。

| 独立平台参考资源 | 占用 |
|---|---:|
| LUT | 9,807 |
| 触发器 | 9,893 |
| 36 Kb 块 RAM 等效块数 | 12 |
| DSP | 0 |

[参考资源报告](reports/gpu-20261023/platform-reference-utilization.rpt) · [参考层级报告](reports/gpu-20261023/platform-reference-hierarchy.rpt) · [检查点来源](reports/gpu-20261023/platform-reference-source.txt)

计算模块与参考平台简单相加为 **94,109 LUT、99,030 触发器、256 DSP、12 块 RAM**，低于芯片资源总量；这个预算尚未计入新接口、缓冲和时钟域适配逻辑。

以上用于后续预算，不能作为计算核心 + DDR + PCIe 已完成联合布线的结论。DDR 颗数与总线宽度已确认匹配该参考配置；实际引脚、电压与时钟仍需要匹配整卡工程；当前计算接口仍仅有 16 位字地址，每空间 256 KiB。接入 DDR 需要协议适配及寻址扩展，不能因外接大容量存储就自动访问全部空间。

## 复现

```sh
make check
make synth
vivado -mode batch -source scripts/vivado_gpu.tcl
```

脚本固定器件 xc7a200tfbg484-2，默认 4×16、20 ns；可选参数依次为时钟周期（ns）、核心数、每核心 lane 数。输出在 `build/vivado-gpu/`，包含综合/布线利用率、层级、时序、布线状态、DRC 和检查点。没有生成 bitstream。

本次 windev 运行目录：`C:/Users/Owner/milku-gpu4-dsp-20261023`。生产源码校验值见 [SHA-256](reports/gpu-20261023/source-sha256.json)。仓库内工具报告仅统一换行、去除行末空白，报告数据未改动。
