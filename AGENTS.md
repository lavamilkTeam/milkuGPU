# Milku 工程约定

- 修改、设计、评审和测试代码前使用 `code-boundary-standards`。
- 文档使用 `.agents/skills/milku-docs/SKILL.md`，放在 `docs/`。
- 先读 `docs/architecture.md` 和 `docs/interfaces.md`。
- 标量兼容入口实现 Milku R32 v1：32 个 32 位通用寄存器和 32 位定长指令；不兼容旧控制字。修改 ISA 时同步修改参考模型、固定向量和文档。
- `rtl/milku_gpu.v` 是并行入口（默认 4×16，R32 SIMD v1）；新增 3 条身份读取指令，分歧时停止并报错。见 `docs/gpu.md` 和 `docs/gpu-interfaces.md`。
- `rtl/lavaneko_core.v` 是标量兼容入口；只通过端口接入指令和数据存储器。
- 依赖方向：GPU → SIMD 核心/仲裁器 → lane/仲裁器 → 寄存器组/ALU/DSP 乘除；标量核心依赖寄存器组/ALU/原迭代乘除。底层模块不得依赖上层或测试代码。
- `tests/` 使用公开端口验证，不通过内部层级读写处理器状态。
- `scripts/` 负责验证、构建与 Vivado 集成，不属于处理器 RTL。
- 模块端口、复位、握手和时序约定必须与文档一致。
- 改动后运行 `make check` 与 `make synth`；未运行 Vivado 或板测不能声称 FPGA 验证通过。
- 上游提交记录保留；来源与许可范围见 `THIRD_PARTY_NOTICES.md` 和 `LICENSE-SCOPE.md`。
