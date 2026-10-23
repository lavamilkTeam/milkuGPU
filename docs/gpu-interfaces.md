milku

# 并行接口

入口 `rtl/milku_gpu.v`，默认参数 `CORES=4`、`LANES=16`。各数组用 Verilog 扁平向量传递，核心 0 / lane 0 占低位；以下 C=CORES，L=LANES。

| 端口 | 方向 | 位宽 | 约定 |
|---|---|---|---|
| clk / reset | 输入 | 各 1 | 同步高有效复位，所有接口同一时钟域 |
| launch_valid / launch_ready | 输入 / 输出 | 各 C | 每核心独立握手；仅 valid & ready 接受任务 |
| launch_pc | 输入 | C×16 | 程序入口，字地址 |
| launch_mask | 输入 | C×L | 活动通道位图 |
| launch_task_base | 输入 | C×32 | TASKID 的起始编号 |
| busy / done / fault | 输出 | 各 C | 执行中 / 已停止 / 分支分歧 |
| instruction_valid / instruction_ready | 输出 / 输入 | 各 1 | 取指事务请求 / 完成 |
| instruction_address / instruction_data | 输出 / 输入 | 16 / 32 | 指令字地址 / 指令 |
| memory_valid / memory_ready | 输出 / 输入 | 各 1 | 数据事务请求 / 完成 |
| memory_write | 输出 | 1 | 1=写入，0=读取 |
| memory_address | 输出 | 16 | 数据字地址 |
| memory_write_data / memory_read_data | 输出 / 输入 | 各 32 | 写入 / 读回数据 |
| retire_valid | 输出 | C | 每核心本拍有效的退休事件 |
| retire_pc / retire_instruction | 输出 | C×16 / C×32 | 退休指令地址 / 机器字 |
| retire_active / retire_write | 输出 | 各 C×L | 活动掩码 / 实际写寄存器的 lane |
| retire_data | 输出 | C×L×32 | 各 lane 写回数据；未写回填零 |

目的寄存器由 retire_instruction[25:21] 得到。退休事件对应整核心指令完成，不代表所有 lane 在同一物理周期写回。仅 retire_valid 有效时解释 retire_* 载荷。

启动参数在握手沿锁存，之后可改变。busy 时 launch_ready=0；启动新任务会清空本核心所有 lane 的寄存器、标志和乘除状态，但不清空外部存储。valid 若持续到任务结束且 ready 再次为 1，会被当作新任务接受，因此发送端应在握手后撤销 valid。

存储接口只有 valid & ready 上升沿才完成事务。等待时 valid、地址、写标志和写数据必须稳定。ready 表示事务完成，读数据须同时有效；不能只表示地址被接收。原生 BRAM、AXI、MIG 都需要协议适配。

复位屏蔽请求并丢弃未完成任务、未消费乘除结果和仲裁所有权，不撤销已完成的外部写入。外部存储适配器必须协同取消未完成事务，避免旧响应作为新任务结果。

fault 目前仅表示分支分歧，不等同乘除错误。除零与有符号除法溢出继续通过每 lane 的 MDSTAT 读取，沿用基础 ISA 行为。
