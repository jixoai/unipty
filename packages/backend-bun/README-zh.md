# @unipty/backend-bun

[English](./README.md) | 简体中文 · [GitHub](https://github.com/jixoai/unipty) · [文档站点](https://unipty.jixoai.com)

适配**运行时原生 `Bun.Terminal`** 底层的官方 UniPty Backend。它只能在 Bun 运行时内运行：`Bun.Terminal` 随 Bun 本体分发（Linux/macOS ≥ 1.3.13，Windows 经 ConPTY ≥ 1.3.14），因此本包没有自己的原生依赖。

- **来源**：基于 `Bun.Terminal` 的 `runtime-native`；子进程以 `Bun.spawn(argv, { terminal })` 启动。这是 Bun 自己的 PTY API，不是 Node API，也不是第三方绑定。
- **表示**：双向原生**字节**。终端 `data` 回调的输出分块以 `Uint8Array` 透传，不复制、不重编码；端点是字节原生的，因此字符串输入会被 UTF-8 编码。
- **元数据**：无副作用的 `./unipty.metadata` 子路径声明 schema 1、Backend id `bun`、工厂导出 `createBunBackend`、Core 协议 `[1]` 与运行时级目标 `bun`。目标声明只用于预筛选择；verified 支持只来自仓库持有的 Official Catalog，绝不来自本包。

## 使用

```ts
import { UniPty } from "unipty";
import { createBunBackend } from "@unipty/backend-bun";

const backend = await createBunBackend();
const unipty = new UniPty({ backend });

const pty = unipty.spawn(["/bin/bash", "-lc", "htop"], { terminal: { cols: 120, rows: 40 } });
pty.write("q");
const stream = pty.stream({ encoding: "utf8" });
for await (const text of stream) console.log(text);
```

工厂是唯一的获取步骤：在 Bun 之外、在没有 `Bun.Terminal` 的 Bun 上、或低于平台版本下限时，以类型化的 `unsupported` 失败拒绝。就绪的 Backend 不需要进一步的就绪工作；`dispose()` 立即完成，因为底层归 Bun 运行时所有——它不释放自己的任何资源，也绝不触碰存活中的 PTY。

## 写队列策略

数值队列策略归 Backend 所有（不是 UniPty 核心选项）。每个 PTY 拥有一个有界的待写队列：

| 设置                             | 取值                    |
| -------------------------------- | ----------------------- |
| 硬上限（`writeQueueBytes` 选项） | 1 MiB（1048576 字节）   |
| 软恢复水位                       | 硬上限的 3/4（768 KiB） |

`write()` 同步把一个完整值准入队列，随后异步泵按序把数据段移交给 `Bun.Terminal.write`：

- 待写字节在软水位及以下时，`write()` 返回 `true`。
- 超过软水位后值仍被完整接受，但 `write()` 返回 `false`：暂停并等待 `drain()`，绝不重试该值。
- 会把待写字节推过硬上限的值被整体拒绝，抛出类型化的 `backpressure` 失败——绝不部分接受、绝不静默丢弃。背压是建议性的，容量尚存时后续较小的写入仍可能成功。
- `drain()` 在待写字节降回软水位（或队列清空）时完成；输入先失效则以其 `closed` 拒绝。

被接受的值会复制进队列自有内存，`write()` 返回后调用方可复用、detach 或转移自己的缓冲区。实测底层自身不施加写背压（2026-08-20 探针向不读数据的子进程连续压入 200 MiB，`Bun.Terminal.write` 无任何部分接受），因此本队列是唯一的背压边界。

## 本适配器记录的底层语义

- **退出观察**：`exited` 等待子进程的 `exited` promise，随后依据子进程的 `exitCode`/`signalCode` 事实报告 `{ exitCode, signal }`。信号致死时 Bun 把 `exited` 解析为 `128 + signal`，而 `exitCode` 保持 `null`、`signalCode` 携带名称（例如 `terminate()` 之后 `{ exitCode: null, signal: "SIGTERM" }`）；两项事实都不可观测时，诚实的报告是 `null`/`null`。
- **`close()`** 只调用 `terminal.close()`——关闭传输、不向子进程发信号。失去控制终端后死亡的子进程是被操作系统终止的，不是被这次调用；退出观察在 close 之后依然存活并独立结算。close 之后 `write()`、`resize()`、`drain()` 以公共 `closed` 码拒绝。
- **`terminate()`** 只调用一次 `Bun.Subprocess.kill()`（默认 SIGTERM），幂等，且绝不关闭传输。
- **`resize(cols, rows)`** 映射到按字符单元格的 `terminal.resize`；底层拒绝以类型化的 `unsupported` 失败浮出，原始 cause 保留。
- **输出流完成**只跟随 PTY 传输（干净 EOF 完成；传输读错误使流出错）。它绝不合成子进程退出结果，退出观察也绝不合成流完成。Terminal 的 `exit` 回调报告的是传输拆除——不是子进程完成——因此子进程退出时，适配器会合成底层缺失交付的主侧 EOF，独立的退出观察来自 `Subprocess.exited`。
- PTY 从属端以规范模式 + 内核回显启动；需要原始输入的子程序必须自行设置。

## 部署

部署的 Bun 运行时提供全部底层。版本下限：1.3.13（Linux/macOS，`Bun.Terminal` 引入处）与 1.3.14（Windows ConPTY）。一个运行时/平台元组只有当仓库持有的 Official Catalog 具备精确包与元组的通过公共契约证据时才呈现为 **verified**；否则声明的目标为 **declared-unverified**，证据缺失绝不是永久的“不支持”声明。

### Windows ConPTY 字节保真

Bun 文档说明 ConPTY 输出与子进程原始字节流不逐字节一致（要经过 Windows 控制台 API）。本适配器不做字节保真声明：ConPTY 输出按底层报告的样子作为原生 Terminal Bytes 呈现——字节进、字节出、不重编码——需要字节精确流的消费者不应指望 ConPTY 不做改写。

## 底层真相：输出缓冲

`Bun.Terminal` 通过 `data` 回调推送输出，没有传输级流控，且底层内部读线程对主侧的缓冲本就无界。因此 Core 的 bootstrap 背压只能暂停**它自己的**泵，本适配器无法把暂停传导进底层：无人消费时（例如首视图之前的 bootstrap 缓冲满载），输出会在 Bun 的内部缓冲中累积。本适配器的有界写队列是这条路由唯一的背压边界。这是如实记录的底层限制，不是 UniPty 契约变更。
