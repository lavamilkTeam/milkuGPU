# Lavaneko Studio

预留独立桌面应用模块，属于当前 monorepo。

选型：Go + Wails，前端使用 Vue 3 + TypeScript + CSS + Tailwind CSS + shadcn-vue。

Studio 负责项目文件、构建入口、源码与反汇编显示、寄存器和内存面板、VGA 画面、键盘输入及软盘镜像操作。CPU 执行逻辑由 `emulator` 提供，编译工作由 `toolchain` 提供。

目前仅建立目录与模块边界，尚未初始化 Wails 或前端应用。
