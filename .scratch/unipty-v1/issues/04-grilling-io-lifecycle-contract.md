Type: grilling
Status: resolved

Part of: [UniPty v1 Wayfinder Map](../map.md)

Blocked by: 02

## Question

在 runtime/backend 事实矩阵之后，与用户逐项确定 UniPty 核心的 I/O 表示、编码损失、chunk 语义、输入写入、resize、exit、signal、kill、teardown 和 unsupported 行为；最终回答“哪些行为是所有 Backend 的共同契约，哪些只能作为能力声明”。

## Confirmed Decisions

### Output representation

- Backend 可以原生提供 Terminal Bytes、Terminal Text 或同时提供两者。
- `utf8` 输出优先使用原生 Terminal Text；仅在没有原生文本时，从 Terminal Bytes 增量解码。
- Terminal Text 不得重新编码并冒充原生 Terminal Bytes；text-only Backend 必须明确报告 bytes 输出不可用。
- chunk 只是 transport fragment，不是字符、行或终端消息边界。

```ts
pty.stream({ encoding: "utf8" });
// ReadableStream<string>

pty.stream({ encoding: "bytes" });
// ReadableStream<Uint8Array>
```

两个流都支持 `for await...of`。`Buffer` 可以作为 `Uint8Array` 子类零拷贝穿过实现，但不是公共类型。

### Input representation

```ts
pty.write(data: string | Uint8Array);
```

- Backend 原生接受传入表示时，直接写入，不做无意义转换。
- byte-native Backend 收到 string 时，上层可以自动编码为 UTF-8 bytes。
- text-only Backend 收到 bytes 时，上层保持严格，默认明确拒绝，不能静默解码。
- text-only Backend 可以在自身配置中显式启用 Backend Write Decoder；这种宽松能力不改变上层的严格转换规则。

```ts
writeDecode?: true | TextDecoder;
```

| Value         | Backend behaviour                                   |
| ------------- | --------------------------------------------------- |
| `undefined`   | 严格拒绝 byte writes。                              |
| `true`        | 为当前 PTY 输入创建并持有默认 UTF-8 `TextDecoder`。 |
| `TextDecoder` | 使用调用方提供的 encoding、fatal 与 BOM 策略。      |

Decoder 状态必须跨多次 `write(Uint8Array)` 保持，以正确处理被切开的多字节序列；当输入侧最终结束或 PTY teardown 时必须执行一次最终 flush。flush 或 fatal decoding failure 必须显式暴露，不得丢弃。该路径只能声明为 decoded Terminal Text input，不能声明为 native Terminal Bytes input。

### Write acceptance and readiness

```ts
const ready = pty.write(data);
// boolean
```

- `write()` 正常返回即表示本次输入已被完整接收并排队等待有序交付，不存在 partial write，也不能重发。
- `true` 表示输入队列仍低于压力阈值，可以继续写入。
- `false` 表示本次输入仍已完整接收，但调用方应暂停后续写入并等待 drain。
- 返回值不是 byte length，也不承诺数据已 flush 到 PTY transport 或已被 child process 消费。
- 同步布尔值保留按键写入的低开销 fast path；不会为每次写入强制创建 Promise。

### Drain Wait

```ts
await pty.drain();
```

- 当前 Write Readiness 已恢复时立即 resolve。
- 在 `write()` 返回 `false` 后，等待输入队列降至可以继续写入的恢复阈值。
- 输入侧关闭或发生不可恢复错误时，在恢复就绪前 reject。
- `drain()` 不承诺输入队列完全清空、底层 PTY transport 已 flush，或 child process 已消费数据。

### Advisory backpressure

- `write()` 返回 `false` 是暂停建议，不是禁止后续调用的硬门闩。
- 调用方可以继续尝试写入；只要有界输入队列仍能容纳完整值，正常返回仍表示该值已完整接收一次。
- 队列饱和而无法容纳完整值时，`write()` 必须同步抛出 typed input backpressure failure；该值完全未接收。
- 不允许 partial acceptance、静默丢弃或无界扩大输入队列。

### Backend Queue Policy

- UniPty v1 公共层不暴露数值型输入队列阈值、容量或计量单位。
- 每个 Backend 必须采用有界输入队列，并拥有适合其 native text、native bytes、remote transport 或其他实现成本的 Queue Policy。
- Backend 可以通过自身专属 options 暴露阈值与容量调节，但不能将其单位或默认值声明为 UniPty 的可移植保证。
- 公共契约只统一 Write Readiness、Drain Wait 与 typed saturation failure 的可观察行为；conformance 验证行为，不比较具体容量。

### Terminal Stream Detachment

- `ReadableStream.cancel()` 只脱离当前 Terminal Stream 输出视图。
- `for await...of` 提前退出所触发的默认 Web Stream cancellation 采用相同语义。
- Stream Detachment 不关闭 PTY 输入、不关闭 PTY transport，也不终止 child process。
- PTY 与进程生命周期只能由后续明确的 lifecycle API 控制，不能从输出消费状态推断。

### Output retention phases

```text
spawn -> first Terminal Stream
        bounded Bootstrap Output Buffer; full => PTY output backpressure

last view detached -> later Terminal Stream
                      drain and discard; future output only
```

- 首个 Terminal Stream 建立前，UniPty 以 Backend 原生输出表示保存有界 Bootstrap Output Buffer，保证启动输出不因订阅竞态丢失。
- Bootstrap Output Buffer 满时对 PTY 输出施加 backpressure，不静默截断启动输出；首个视图按原始顺序消费 buffer 后进入 live output。
- 至少一个视图曾经建立后，当最后一个视图脱离，UniPty 继续 drain PTY transport 并丢弃无消费者期间的新输出，避免 child process 因输出缓冲满而阻塞。
- 后续新建的 Terminal Stream 只接收其订阅后的未来输出，不获得核心 replay。
- retention、scrollback 与 replay 只能是 Backend 的显式扩展，不能改变核心 Terminal Stream 的默认语义。

### Single Active Terminal Stream

- 同一 PTY 同一时间只允许一个由 UniPty 管理的 active Terminal Stream，与所选 encoding 无关。
- active view 存在时再次调用 `pty.stream(...)`，必须抛出 typed active-view failure。
- active view detach 后可以创建新的 future-only Terminal Stream。
- 需要多个消费者时，调用方显式使用标准 `stream.tee()`；其 branch backpressure、cancellation、chunk aliasing 与必要复制由 Web Streams 语义及调用方负责。
- `tee()` branches 不计作多个 UniPty Terminal Stream，核心不提供 branch 隔离或逐 branch chunk copy 保证。

### Character-cell resize

```ts
pty.resize(cols, rows): void;
```

- `cols` 与 `rows` 必须是有限正整数。
- 公共契约只表达字符单元尺寸，不接受 pixel dimensions 或平台特定终端控制。
- 正常返回只表示 Backend 接受 resize request，不表示 child process 已观察到新尺寸。
- Backend 无法支持某个尺寸时必须显式失败；平台上限与错误分类留给 Backend contract。

### Independent lifecycle observations

- Terminal Stream 的正常结束只表示 Terminal transport EOF；read failure 使该 stream error。
- Process Exit Result 是独立的 child process 生命周期观察，不能由 stream `done` 推导，也不能被 stream cancellation 取消。
- Terminal transport EOF 与 Process Exit Result 可以先后发生或几乎同时发生；UniPty 不将两者压成一个状态码。
- 非零 exit、signal termination 或 transport error 都必须保留在各自的观察面，不得伪装成 clean EOF。

### Close boundary

- `close(): void` 是幂等的逻辑资源与 PTY transport 关闭操作。
- close 返回前必须发布 `closed` 状态；后续操作使用公共 `closed` error code 失败。
- `close()` 之后，PTY 不再接受 `write()`、`resize()` 或新的 `stream()` 创建请求。
- `close()` 不承诺终止 child process；调用方必须通过独立的 termination API 显式请求进程终止。
- active stream 完成、transport 物理释放和保留的 exit watcher 可以异步收尾，不增加第二个公共 `await close()` 层。

### Termination request

- `terminate()` 是幂等的同步 termination request。
- 正常返回只表示 Backend 接受了终止请求，不表示 child process 已退出，也不等待独立的 Process Exit Result。
- 重复调用 `terminate()` 不产生额外的必需效果。

### Non-cascading teardown

- `terminate()` 不隐式调用 `close()`。
- `close()` 不隐式请求 child process 终止。
- 如果调用方需要两种效果，必须显式调用两个操作并自行决定顺序。

### Exit observation after close

- `close()` 不取消已经建立的 Process Exit Result 观察。
- child process 即使在 `close()` 后继续运行，已有退出观察仍必须能够在最终退出时完成。
- 这不恢复已关闭的 Terminal Stream，也不恢复 PTY 的写入、resize 或新 stream 能力。

### Active stream on explicit close

- 调用方显式 `close()` 时，active Terminal Stream 正常完成（`done`）。
- 这是有意关闭 transport 的结果；独立的 transport read failure 仍使 stream error。
- close 后不得创建新的 Terminal Stream。

### Signal capability boundary

- `kill(signal)` 或等价 signal 控制不进入 UniPty v1 common API。
- Backend 可以显式声明 signal capability，并拥有自己的 signal vocabulary。
- 对未声明或不支持的 signal 必须显式失败，不能静默模拟成另一种终止行为。

### Common error model

- 公共操作失败必须提供稳定、可判别的 `error.code`，不要求跨 runtime 的 `Error` class identity。
- v1 common codes 为：`unsupported`、`closed`、`backpressure`、`invalid-argument`、`active-stream`。
- Backend 可以通过结构化 `details` 和/或 `cause` 提供专属诊断；调用方不得依赖 error message 文本。

### Capability discovery

- Backend 可以提供可选的只读 capability metadata，帮助调用方预先展示能力。
- capability metadata 不是共同必需接口，且不能替代实际操作结果。
- 实际操作不支持时仍必须返回 `error.code === "unsupported"`，核心不得根据 metadata 隐式 fallback。

## Handed To Ticket 05

- PtyBackend 的具体能力词汇，以及共同操作与 Backend capability 的接口形态。

## Resolution

2026-08-18: The lifecycle contract is complete for this ticket. UniPty fixes
observable I/O and lifecycle outcomes, while Backend internals own physical
teardown order. PtyBackend shape, selection, and capability vocabulary continue
in ticket 05.

## Evidence For The Next Decision

Bun `Terminal.write()` 返回输入 byte length，但全部输入均已被接受；返回值不表示 partial write，也不能据此重发。未立即写入 PTY 的数据由 Bun 缓冲，完成后触发 `drain`。UniPty 还存在 native-text input，因此没有复制 byte-length 返回值，避免只为计数而额外执行 UTF-8 编码。

`node-pty` 的公开 `write()` 返回 `void`，没有 drain 事件。Bun 虽有 drain callback，但 `write()` 不报告本次是否进入缓冲；本机 Bun 1.3.14 的三个探针也没有产生可直接推导水位的 callback。共同 drain 契约因此只能围绕 Write Readiness 建立，不能冒充所有底层 PTY 的物理 flush barrier。
