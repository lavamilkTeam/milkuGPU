milku

# 接口

所有接口在 `clk` 上升沿采样。`reset` 高有效、同步清零内部状态；复位期间请求 valid 和 halted 被屏蔽。核心固定为 32 位数据和 32 位指令，不再提供 WIDTH 参数。

## 核心端口

| 端口 | 方向 | 位宽 | 约定 |
|---|---|---|---|
| clk / reset | 输入 | 1 | 时钟／同步复位 |
| instruction_valid | 输出 | 1 | 指令请求有效 |
| instruction_ready | 输入 | 1 | 本拍指令数据有效且可接收 |
| instruction_address | 输出 | 16 | 指令字地址，复位为 0 |
| instruction_data | 输入 | 32 | 地址对应的完整指令 |
| memory_valid | 输出 | 1 | 数据请求有效 |
| memory_ready | 输入 | 1 | 本拍完成数据事务；读数据同时有效 |
| memory_write | 输出 | 1 | 本事务同时执行写入 |
| memory_address | 输出 | 16 | 数据字地址 |
| memory_write_data | 输出 | 32 | 写入数据，来源为 STORE 的 Rs（指令 25:21） |
| memory_read_data | 输入 | 32 | 读返回值；写事务时忽略该值 |
| halted | 输出 | 1 | 执行 HALT 后持续为 1，直到复位 |
| flag_zero / flag_carry | 输出 | 各 1 | 已提交的 Z/C |
| result_lo / result_hi | 输出 | 各 32 | 最近完成的乘除结果 |
| md_error | 输出 | 2 | 已提交的乘除状态：0/1/2 |
| retire_valid | 输出 | 1 | 上一个上升沿提交了一条指令 |
| retire_pc | 输出 | 16 | 该指令地址 |
| retire_instruction | 输出 | 32 | 该指令机器字 |
| retire_write | 输出 | 1 | 该次提交写通用寄存器；仅 retire_valid 时解释 |
| retire_destination | 输出 | 5 | 写入的寄存器索引 |
| retire_data | 输出 | 32 | 寄存器写入值；未写时为 0 |

寄存器组公开的 read_a、read_b、write_address 均为 5 位；数据端口在本核心中为 32 位。

`retire_*` 是公开观测接口；没有调试写寄存器接口。其值在提交沿之后更新，使用者在下一上升沿采样有效标志与载荷。

## 存储握手

仅 `valid && ready` 的上升沿完成事务。请求者在 valid=1 且 ready=0 时保持地址、写使能和写数据不变；应答方须在完成沿提供正确读数据。ready 不能只表示“已收地址、数据稍后到达”。

接口最多各有一个请求。核心不会同时发出指令请求和数据请求；数据请求期间不更新 PC/寄存器。同步 BRAM 需通过适配器先取数据，再拉高 ready；本接口不是 AXI，也不是直接的 BRAM 原生接口。

LOAD 和 STORE 是独立操作码，不再支持同一控制字同时读写内存。地址是基址寄存器加符号扩展偏移后的低 16 位，单位为 32 位数据字。

## 乘除接口

| 信号 | 含义 |
|---|---|
| request_valid / request_ready | 同拍为 1 接收 a、b、divide、signed_mode |
| divide | 0 为乘法，1 为除法 |
| signed_mode | 1 按 32 位补码解释输入 |
| result_valid / result_ready | 同拍为 1 消费 lo、hi、error |

忙碌期间 request_ready=0；输入在接收之后可以改变。结果背压期间 result_valid 和结果保持不变。复位会丢弃未完成运算和未消费结果。结果消费后的下一拍重新允许接收请求。

## 寄存器组与 ALU

寄存器组两路组合读取，写入在上升沿生效，复位优先于写入；同址读写在时钟沿前读旧值，沿后读新值。寄存器索引为 5 位，R0..R31 全部可写；R0 不是常零寄存器。

ALU 为纯组合模块，输入 a、b、subtract，输出 result、carry、zero。减法 carry=1 表示无借位。不存在独立有符号溢出标志。
