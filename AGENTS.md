# Milku 工程约定

- 修改、设计、评审和测试代码前使用 `code-boundary-standards`。
- 文档使用 `.agents/skills/milku-docs/SKILL.md`，放在 `docs/`。
- 先读 `docs/architecture.md` 和 `docs/interfaces.md`。
- 本分支保留 Lavaneko 指令语义，使用 Verilog 实现；不沿用旧 Logisim 实现限制。
- `rtl/lavaneko_core.v` 是核心入口；只通过端口接入指令和数据存储器。
- 核心只依赖寄存器组、ALU 和乘除单元；这些模块不得依赖核心或测试代码。
- `tests/` 使用公开端口验证，不通过内部层级读写处理器状态。
- `scripts/` 负责验证、构建与 Vivado 集成，不属于处理器 RTL。
- 模块端口、复位、握手和时序约定必须与文档一致。
- 改动后运行 `make check` 与 `make synth`；未运行 Vivado 或板测不能声称 FPGA 验证通过。
- 上游提交记录保留；来源与许可范围见 `THIRD_PARTY_NOTICES.md` 和 `LICENSE-SCOPE.md`。
