# 编译工具链

目标流程：C 源码 → 汇编 → 目标文件 → 链接后的程序二进制。

- [compiler](compiler/)：C 编译器。
- [assembler](assembler/)：汇编器。
- [linker](linker/)：链接器。
- [programs](programs/)：现有演示程序与 Logisim ROM 镜像，由根 `npm run build` 生成。

编译器、汇编器和链接器目前为预留目录。现有 `.hex` 是 Logisim 文本 ROM 格式，不是已经实现的 C 编译产物或可启动软盘镜像。

工具链使用 CPU 指令规范，向模拟器及实体机器提供程序，不依赖 Studio 界面。
