milku

# 验证

2026-10-22，本次实际执行：Icarus Verilog 12.0、Yosys 0.52、Node.js 20.19.2、Python 3。工具版本以复现环境实际输出为准。

| 检查 | 范围 | 结果 |
|---|---|---|
| 指令结果对照 | 16/32 位，各 3,976 次提交，分别使用随机等待和无等待 | 4 组通过，共 15,904 次 |
| 存储器结果 | 每组比较全部 65,536 个数据字 | 通过 |
| 乘除单元独立检查 | 每种位宽 659 次，与 Verilog 数学运算对照 | 1,318 次通过 |
| 握手／复位 | 请求等待、结果背压、运算中／结果待取时复位、HALT 后复位 | 通过 |
| PC 边界 | 跳转到 65535，再执行 NOP 回绕到 0 | 通过 |
| 模块边界 | 生产清单、依赖方向、测试层级访问限制、参考向量哈希 | 通过 |
| 通用综合 | 16/32 位，层次检查、无锁存器、无未驱动／多驱动检查 | 通过 |
| Vivado 综合、布局布线、时序、板测 | 未执行 | 无结果 |

## 参考向量

`scripts/reference_vectors.mjs` 仅用于验证，调用外部基线的公开 `cpu/isa/index.js` 接口。它不是产品 JavaScript 模拟器；仓库内不保留旧 Logisim 生成器或应用工具链。

基线：`8e249ae491903985db7ca79df683efa5b7946267`。程序包括上游演示、乘除边界组合、1,000 条固定种子随机命名指令、512 条原始控制字及旧 Z 分支语义检查。包含除零、MIN/-1、保留扩展码和同时加载／存储的控制字。

每次提交比较 PC、指令字、下一 PC、四个寄存器、HI/LO、Z/C、错误状态和 HALT。寄存器影子状态只依据公开提交端口更新；最后逐字核对内存。

每个程序有 3,965 个机器字，包含循环和跳过指令，实际提交 3,976 次。机器字文件每行十六进制代表完整指令，不是字节序列。trace 每行从高到低拼接：

```text
旧 PC[16] | 指令[W+16] | 新 PC[16] | REG1..REG4[各 W]
| LO[W] | HI[W] | Z[1] | C[1] | MD_ERROR[2] | HALT[1]
```

内存期望文件使用 `@地址 数据` 稀疏格式，未列出的字初始化为零。

文件哈希、基线和数量见 `tests/vectors/manifest.json`。生成器拒绝非指定提交或有未提交修改的基线工作树。

```sh
git clone https://github.com/lavamilkTeam/lavanekoCPU.git /tmp/lavaneko-reference
git -C /tmp/lavaneko-reference checkout 8e249ae491903985db7ca79df683efa5b7946267
node scripts/reference_vectors.mjs /tmp/lavaneko-reference
make check
make synth
```

Node 仅在重新生成向量时需要；使用已提交向量运行仿真不需要 Node。测试不依赖网络。通用综合结果不含外部存储器，不可用其门级单元数量换算 200T 的最大核心数或工作频率。

## PDF 导出

```sh
chromium --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PWD/docs/lavaneko.pdf" "file://$PWD/docs/lavaneko.html"
pdfinfo docs/lavaneko.pdf
pdftoppm -scale-to 1400 -png docs/lavaneko.pdf /tmp/lavaneko-page
```

HTML 与 SVG 是可编辑源。导出后检查文本、页数和每页渲染，不把临时截图放入仓库。
