# @unipty/backend-zigpty

[English](./README.md) | 简体中文 · [GitHub](https://github.com/jixoai/unipty) · [文档站点](https://unipty.jixoai.com)

面向 Node 运行时的官方 UniPty Backend，适配第三方 **zigpty** 底层实现（Zig 构建的 NAPI 预编译）——绝不是 Node 运行时原生 PTY API。

- **路由身份：** `zigpty`
- **来源：** 第三方 [`zigpty`](https://www.npmjs.com/package/zigpty)（Zig 实现的 PTY，NAPI 预编译直接随 npm tarball 分发）
- **Core 协议：** `1`

## 为什么用 `zigpty`？

`zigpty` 在自己的 tarball 内自带八个元组的 NAPI 预编译（Linux/macOS/Windows × x64/arm64，含 glibc 与 musl）：零运行时依赖、没有 `optionalDependencies`、没有安装脚本、不碰 node-gyp——体积也远小于 node-pty 发行版。它暴露 node-pty 兼容的接口，因此本路由是 `@unipty/backend-node-pty` 之外的第二条 Node 底座选择，不是替代品。

## 使用

```ts
import { UniPty } from "unipty";
import { createZigptyBackend } from "@unipty/backend-zigpty";

// 一次性底层加载（解析 tarball 内预编译插件）；此后一切都是同步的。
const backend = await createZigptyBackend();

const unipty = new UniPty({ backend });
const pty = unipty.spawn(["/bin/sh", "-i"], {
  cwd: process.env.HOME,
  terminal: { cols: 120, rows: 40 },
});

const text = pty.stream({ encoding: "utf8" });
for await (const chunk of text) console.log(chunk);

pty.write("echo hi\n");
pty.terminate();
pty.close();
```

获取是显式的：`await import()` + `createZigptyBackend()` 始终是确定性路径；`@unipty/backend` 的 `autoResolveUniPtyBackend()` 是便捷封装。元数据从 `@unipty/backend-zigpty/unipty.metadata` 无副作用导出（schema 1；导入它不会加载任何原生插件、不会创建任何 pty）。

## 选项

```ts
createZigptyBackend({
  encoding?: "buffer" | "utf8", // 默认 "buffer"
  writeDecode?: true | TextDecoder,
  name?: string, // 传给底层；成为子进程的 $TERM
  writeQueueBytes?: number, // 有界待写准入队列，默认 1 MiB
  outputSpool?: true | { memoryBytes?: number; directory?: string },
})
```

| 模式                                 | Endpoint `native`                    | 输出 chunk                                                  | 输入接受度                                   |
| ------------------------------------ | ------------------------------------ | ----------------------------------------------------------- | -------------------------------------------- |
| `encoding: "buffer"`（默认）         | `{ input: "text", output: "bytes" }` | `{ kind: "bytes", bytes }`（`Buffer` 以 `Uint8Array` 透传） | 仅文本；字节写入以 `unsupported` 失败        |
| `encoding: "buffer"` + `writeDecode` | `{ input: "both", output: "bytes" }` | `{ kind: "bytes", bytes }`                                  | 文本与字节；字节经由适配层持有的有状态解码器 |
| `encoding: "utf8"`                   | `{ input: "text", output: "text" }`  | `{ kind: "text", text }`                                    | 仅文本；字节写入以 `unsupported` 失败        |
| `encoding: "utf8"` + `writeDecode`   | `{ input: "both", output: "text" }`  | `{ kind: "text", text }`                                    | 文本与字节；字节经由适配层持有的有状态解码器 |

底层 `write` 在任何模式下都只接受字符串——与 node-pty 路由不同，字节输入始终需要 Backend 持有的 `writeDecode` 便捷项。`writeDecode: true` 安装非致命 UTF-8 `TextDecoder`；传入你自己的 `TextDecoder` 会把它的 encoding/fatal/BOM 配置复制成 **每个 PTY 独立** 的有状态解码器——解码器状态绝不在 PTY 之间共享。致命解码失败以 `invalid-argument` 整值拒绝，原始 `TypeError` 作为 `cause`。

写就绪：每个 Endpoint 持有有界准入队列（默认 1 MiB，四分之三处为软恢复水位；可用 `writeQueueBytes` 调整）。值总是整条交给底层，因此超过软水位后 `write()` 返回 `false`（暂停建议；降回水位后 `drain()` 完成），超过硬上限则以 `backpressure` 整值拒绝——绝不部分接受。准入计账先于任何解码器状态推进：字节值以原始形态准入、在泵送时才解码，被饱和拒绝的值让有状态解码器保持原样，重试同样的字节得到完全相同的解码。`writeDecode` 的致命失败在泵送时终止输入面：该值被丢弃、`drain()` 以 `invalid-argument` 拒绝、后续 `write()` 重复抛出同一失败。`drain()` 是就绪恢复，不是物理冲刷：底层自身的 fd 写队列没有完成信号。

### 输出内存边界（`outputSpool`）

默认关闭；当消费端可能无限期停读时开启——尤其是 Windows，那里底层的输出流控无法传导到内核（见下文 Windows 条目）：

```ts
const backend = await createZigptyBackend({
  outputSpool: { memoryBytes: 4 * 1024 * 1024 }, // 或直接 `true` 使用默认值
});
```

开启后，输出记录进入一个 FIFO：内存头有界（`memoryBytes`，默认 1 MiB），越界的记录溢写到 `directory` 下（默认系统临时目录）的单一适配层临时文件，并严格按消费端的节奏回放进 source。公共流的字节与不开 spool 时完全一致——文本记录按完整记录往返、chunk 边界保持不变。传输 EOF 请求只会在 spool 完全排空后才完成 source，快退子进程的尾部输出不会被截断；显式 `close()`（以及流取消）仍然同步完成并丢弃未送达的记录。在底层能够暂停的平台上，积压的 spool 还会把压力传导进内核，因此内存界是第一道缓冲，越过它子进程才会因内核压力阻塞。需要知道的取舍：溢写 IO 是同步的；积压期间的磁盘占用按设计不设上限（仅受子进程自身输出量约束）；临时文件在完成/close/取消时删除——进程被强杀时交由系统临时目录清理。溢写失败（ENOSPC、目录消失）以类型化错误终止输出 source，而不是悄悄放开内存上限。

## 适配层映射（并文档化）的底层行为

基于安装的 `zigpty` 0.2.1 源码与实机探针验证：

- **原生门禁是硬性的。** `zigpty` 在预编译无法加载时会静默回退到基于管道的伪 PTY（没有真实 tty，没有内核 winsize）。本适配层在就绪阶段检查 `hasNative`，以 `unsupported` 失败——绝不进入回退路径，因此"就绪的 Backend"永远意味着真实 PTY 底座。
- **`close()` = 逻辑传输释放，不发信号，物理拆除延迟。** 底层的 `close()` 会关闭 master fd 并对存活子进程显式发送 `SIGHUP`，直接调用会把 close 级联成终止。本适配层只在退出观察落定之后才调用底层 `close()`（此时底层内部的存活探测已无 pid 可发信号）：closed 状态、流完成、I/O 拒绝都是即时的，而 close 绝不向子进程发信号，退出观察一直保持待定直到子进程真正死亡。close 后读取继续流动（close 之后的 chunk 走丢弃路径，数据路径自身的暂停保证任何队列有界）：若在此处暂停读取，退出观察会被未排空的输出无限推迟——底层在暂停读取积压输出期间会推迟 `onExit`（darwin 实证，0.2.1）。
- **`terminate()` = 带底层默认信号的 `kill()`**（`SIGHUP`），随后恢复 master 读取。对已死亡子进程的 `ESRCH` 被吞掉，保持幂等。传输保持打开。这次恢复是承重的：底层在暂停读取积压输出期间推迟退出观察，被 kill 的洪水子进程若不恢复读取将永远无法落定 `exited`。
- **`exited`** 只包装一次 `onExit`。载荷以数字报告 `signal`（`0` = 无信号）；非零数字映射为其观察到的字符串形式（`"SIGTERM"`）。信号致死时保留底层报告的数字退出码（观察值为 `0`）——适配层原样透传观察结果，绝不虚构底层没有报告的 `null`。
- **exec 失败是退出观察，不是 spawn 异常。** 底层先 fork 再 exec；可执行文件缺失会立即产生 `{ exitCode: 1, signal: null }` 而不是抛错。只有参数形态的失败才会以类型化的同步 spawn 错误浮出（`invalid-argument` / `unsupported`，原始错误作为 `cause`）。
- **几何尺寸与 resize** 以真实 tty winsize 更新到达子进程。
- **输出背压在底层可暂停的平台上传导到内核。** Core 持有的 source 跟不上时暂停 master 读取、拉动时恢复（使用底层公开的 `pause()`/`resume()`；不触碰任何私有内部字段）。不开 `outputSpool` 时，source 一停拉就暂停；开启后，spool 先吸收上限为内存界的突发，越过该界才触发暂停（内核压力，阻塞子进程而不是撑大任何队列）。
- **Windows 以声明的缓冲语义运行。** 底层带有 ConPTY 预编译，但其公开的 `pause()`/`resume()` 输出流控制在 Windows 上是空操作（0.2.1），消费端驱动的背压无法传导进内核——与 Deno 路由同类的声明式底层限制。路由不再拒绝就绪，而是照常运行，由 Backend 持有的 `outputSpool` 选项充当内存边界：停读的消费端代价是有界内存加磁盘，而不是无界内存。Windows 上请开启它。Windows 元组的 verified 支持仍由证据门控（有公开契约证据之前保持 declared-unverified）。
- **传输 EOF 是合成的。** 底层不暴露传输 EOF 事件（只有 `onData`/`onExit`）：子进程退出后，适配层延迟一个 macrotask 再完成输出源——与 Bun 路由对 `Bun.Terminal` 的合成方式一致——尾部 chunk 仍能在完成前入队。该合成方式声明的底层限制：会话首进程死亡后仍持有 slave 端的后代进程的输出会在完成点被截断；传输读错误无法与干净 EOF 区分（底层两者都不暴露）。
- **Windows 以声明的缓冲语义运行**（见上节）：元数据 targets 的 `os` 保持开放；任何元组要呈现为 verified 都需要精确包版本的公开契约证据（见发布目录）。没有证据时元组为 _declared-unverified_——声明只做选择预过滤，从不承诺原生可加载。

## 部署

- 预编译 NAPI 插件随 `zigpty` 自己的 tarball 分发（`prebuilds/*.node`，导入时按平台解析）；用常规包管理器安装本包即可零脚本获得二进制。没有预编译的元组会在就绪阶段以 `unsupported` 失败——绝不静默回退到管道。
- 在宿主 bundle 中保持本包 **external 且对解析器可见**（与任何原生插件包相同的规则）：打包或搬移产物模块会割裂底层的 `prebuilds/` 树。打包部署请使用 `@unipty/helper-backend` 生成带延迟加载器的显式 Backend manifest。
- 纯 Node 部署体验：无 FFI、无运行时旗标、无权限、支持的预编译平台上无安装期编译。

## 支持状态

元数据只声明运行时层级（`targets: [{ runtime: "node" }]`）；`os`/`arch` 保持开放，一个元组只有伴随精确包版本的公开契约证据（见发布目录）才算 **verified**。没有证据时元组为 _declared-unverified_——声明只做选择预过滤，从不承诺原生可加载。
