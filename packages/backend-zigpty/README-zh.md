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
})
```

| 模式                                 | Endpoint `native`                    | 输出 chunk                                                  | 输入接受度                                   |
| ------------------------------------ | ------------------------------------ | ----------------------------------------------------------- | -------------------------------------------- |
| `encoding: "buffer"`（默认）         | `{ input: "text", output: "bytes" }` | `{ kind: "bytes", bytes }`（`Buffer` 以 `Uint8Array` 透传） | 仅文本；字节写入以 `unsupported` 失败        |
| `encoding: "buffer"` + `writeDecode` | `{ input: "both", output: "bytes" }` | `{ kind: "bytes", bytes }`                                  | 文本与字节；字节经由适配层持有的有状态解码器 |
| `encoding: "utf8"`                   | `{ input: "text", output: "text" }`  | `{ kind: "text", text }`                                    | 仅文本；字节写入以 `unsupported` 失败        |
| `encoding: "utf8"` + `writeDecode`   | `{ input: "both", output: "text" }`  | `{ kind: "text", text }`                                    | 文本与字节；字节经由适配层持有的有状态解码器 |

底层 `write` 在任何模式下都只接受字符串——与 node-pty 路由不同，字节输入始终需要 Backend 持有的 `writeDecode` 便捷项。`writeDecode: true` 安装非致命 UTF-8 `TextDecoder`；传入你自己的 `TextDecoder` 会把它的 encoding/fatal/BOM 配置复制成 **每个 PTY 独立** 的有状态解码器——解码器状态绝不在 PTY 之间共享。致命解码失败以 `invalid-argument` 整值拒绝，原始 `TypeError` 作为 `cause`。

写就绪：每个 Endpoint 持有有界准入队列（默认 1 MiB，四分之三处为软恢复水位；可用 `writeQueueBytes` 调整）。值总是整条交给底层，因此超过软水位后 `write()` 返回 `false`（暂停建议；降回水位后 `drain()` 完成），超过硬上限则以 `backpressure` 整值拒绝——绝不部分接受。`drain()` 是就绪恢复，不是物理冲刷：底层自身的 fd 写队列没有完成信号。

## 适配层映射（并文档化）的底层行为

基于安装的 `zigpty` 0.2.1 源码与实机探针验证：

- **原生门禁是硬性的。** `zigpty` 在预编译无法加载时会静默回退到基于管道的伪 PTY（没有真实 tty，没有内核 winsize）。本适配层在就绪阶段检查 `hasNative`，以 `unsupported` 失败——绝不进入回退路径，因此"就绪的 Backend"永远意味着真实 PTY 底座。
- **`close()` = 逻辑传输释放，不发信号，物理拆除延迟。** 底层的 `close()` 会关闭 master fd 并对存活子进程显式发送 `SIGHUP`，直接调用会把 close 级联成终止。本适配层立即暂停 master 读取，只在退出观察落定之后才调用底层 `close()`（此时底层内部的存活探测已无 pid 可发信号）：closed 状态、流完成、I/O 拒绝都是即时的，而 close 绝不向子进程发信号，退出观察一直保持待定直到子进程真正死亡。
- **`terminate()` = 带底层默认信号的 `kill()`**（`SIGHUP`）。对已死亡子进程的 `ESRCH` 被吞掉，保持幂等。传输保持打开。
- **`exited`** 只包装一次 `onExit`。载荷以数字报告 `signal`（`0` = 无信号）；非零数字映射为其观察到的字符串形式（`"SIGTERM"`）。信号致死时保留底层报告的数字退出码（观察值为 `0`）——适配层原样透传观察结果，绝不虚构底层没有报告的 `null`。
- **exec 失败是退出观察，不是 spawn 异常。** 底层先 fork 再 exec；可执行文件缺失会立即产生 `{ exitCode: 1, signal: null }` 而不是抛错。只有参数形态的失败才会以类型化的同步 spawn 错误浮出（`invalid-argument` / `unsupported`，原始错误作为 `cause`）。
- **几何尺寸与 resize** 以真实 tty winsize 更新到达子进程。
- **输出背压传导到内核。** Core 持有的 source 跟不上时暂停 master 读取、拉动时恢复（使用底层公开的 `pause()`/`resume()`；不触碰任何私有内部字段），消费端停滞不会撑大无界适配队列。
- **传输 EOF 是合成的。** 底层不暴露传输 EOF 事件（只有 `onData`/`onExit`）：子进程退出后，适配层延迟一个 macrotask 再完成输出源——与 Bun 路由对 `Bun.Terminal` 的合成方式一致——尾部 chunk 仍能在完成前入队。

## 部署

- 预编译 NAPI 插件随 `zigpty` 自己的 tarball 分发（`prebuilds/*.node`，导入时按平台解析）；用常规包管理器安装本包即可零脚本获得二进制。没有预编译的元组会在就绪阶段以 `unsupported` 失败——绝不静默回退到管道。
- 在宿主 bundle 中保持本包 **external 且对解析器可见**（与任何原生插件包相同的规则）：打包或搬移产物模块会割裂底层的 `prebuilds/` 树。打包部署请使用 `@unipty/helper-backend` 生成带延迟加载器的显式 Backend manifest。
- 纯 Node 部署体验：无 FFI、无运行时旗标、无权限、支持的预编译平台上无安装期编译。

## 支持状态

元数据只声明运行时层级（`targets: [{ runtime: "node" }]`）；`os`/`arch` 保持开放，一个元组只有伴随精确包版本的公开契约证据（见发布目录）才算 **verified**。没有证据时元组为 _declared-unverified_——声明只做选择预过滤，从不承诺原生可加载。
