# 来源

| 内容 | 来源 |
|---|---|
| Lavaneko 指令定义与参考行为 | https://github.com/lavamilkTeam/lavanekoCPU ，提交 `8e249ae491903985db7ca79df683efa5b7946267` |
| 当前 Milku R32 指令编码与验证模型 | 本次原创扩展；不使用旧四寄存器参考向量 |
| Verilog 实现与当前中文文档 | 本次 Milku 移植 |

上游基线为从旧截图重建的 Logisim CPU；其自身并未声称恢复原始电路。旧兼容版 Verilog 是一次行为移植，不是从现成 Verilog 复制，也不保持 Logisim 的逐周期时序。

原仓库内容保存在 Git 历史中。本次移除工作树中的 Logisim、实体硬件资料、桌面应用和预留工具链，不改变历史内容的来源或权利。

基线提交未附独立 LICENSE 文件。此记录不将上游内容重新许可，也不据仓库公开可见而推定第三方授权。当前原创增量范围单独列在 `LICENSE-SCOPE.md`。

ao68000 已从当前工作树移除；其代码、原许可和旧 Milku 文档保存在本机独立归档中，不作为本核心实现的一部分。

当前 R32 v1 的机器码与旧 Lavaneko 不兼容。旧参考模型、演示程序和向量保存在历史提交；当前 tests/vectors 来自本仓库 scripts/reference_vectors.py。
