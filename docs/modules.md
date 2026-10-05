# Monorepo 模块边界

所有模块共用 Lavaneko 根 Git 仓库。目录按产品职责划分，不创建嵌套仓库。

| 目录 | 职责 | 当前内容 |
|---|---|---|
| `cpu/isa` | 指令格式、编码与架构语义 | `@lavaneko/isa`，包含参考执行模型和演示程序定义 |
| `cpu/hardware` | 实体 CPU 与外设硬件 | 芯片评估、PCB 约束、总线及供电规划 |
| `docs` | 项目文档 | 架构、指令集、PDF、架构图与原始参考图 |
| `logisim/circuits` | 可检查的门电路生成 | `@lavaneko/circuits`，包含生成器及模块测试 |
| `logisim/cli` | Logisim 文件与进程适配 | `@lavaneko/cli`，生成工程并调用原生仿真 |
| `logisim/projects` | Logisim 工程 | `@lavaneko/logisim`，16/32 位 `.circ` 文件 |
| `logisim/verification` | 电路仿真输入与结果 | 测试向量；运行日志不纳入 Git |
| `toolchain` | C 编译、汇编、链接和程序镜像 | 现有演示程序放在 `programs`；编译器、汇编器、链接器目录预留 |
| `emulator` | Go 指令集模拟器 | 目录预留，后续独立实现 CPU、内存、外设与调试接口 |
| `studio` | 桌面开发环境 | 目录预留，选型为 Wails、Vue 3、TypeScript、Tailwind CSS、shadcn-vue |
| `tools` | 仓库级维护 | 仅放跨模块构建或维护工具 |

## 当前代码依赖

`logisim/cli → logisim/circuits → cpu/isa`

- JavaScript 包保留原名称和公开入口。跨包使用 `@lavaneko/isa`、`@lavaneko/circuits`，不得引用 `lib/` 或 `tests/`。
- 包内测试通过公开入口验证行为，仅可直接使用本包测试目录内的辅助文件。
- ISA 不依赖 Logisim、工具链、模拟器或桌面界面。电路生成器不依赖 CLI、工具链、模拟器或 Studio。
- dependency-cruiser 检查入口、测试目录、循环依赖与分层；新增 JavaScript/TypeScript 模块时一并登记 workspace 和边界规则。
- 现有参考执行模型是 ISA 测试基准，后续 Go 模拟器通过相同程序与状态结果校验语义。

## 后续模块接入

工具链输出程序二进制与调试信息；模拟器通过加载接口接收程序和磁盘镜像。两者不依赖 Studio。Studio 负责文件选择、构建调用、调试面板与显示，不自行实现 CPU 指令语义。

Go 模拟器与 Wails 应用实现时各自声明 Go module，并通过根 `go.work` 组织。Vue 前端实现时加入根 Bun workspace，前端依赖声明在使用它们的 workspace 内。目前不创建没有实现的 Go module 或前端依赖。

## 构建与产物

- `npm run build`：生成 `logisim/projects/*.circ`、`logisim/verification/*.txt` 与 `toolchain/programs/*`。
- `npm run open` / `npm run open:32`：打开对应 Logisim 工程。
- `npm run check`：格式与边界检查、Bun 测试、电路重建、Logisim 原生验证。

构建会覆盖生成产物。手工编辑的 `.circ` 请另存副本；可重复的电路变更应修改 `logisim/circuits` 源码。
