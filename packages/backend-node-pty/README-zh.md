# @unipty/backend-node-pty

[English](./README.md) | 简体中文 · [GitHub](https://github.com/jixoai/unipty) · [文档站点](https://unipty.jixoai.com)

面向 Node 运行时的官方 UniPty Backend，适配第三方 **node-pty** 底层实现——绝不是 Node 运行时原生 PTY API。

- **路由身份：** `node-pty`
- **来源：** 第三方 `node-pty`，经 [`@lydell/node-pty`](https://www.npmjs.com/package/@lydell/node-pty) 预构建发行版获取
- **Core 协议：** `1`

## 为什么用 `@lydell/node-pty`？

上游 `node-pty@1.1.0` 的 npm 预构建在 darwin-arm64 + Node 22 下 `posix_spawnp` 失败（子进程根本起不来）。`@lydell/node-pty` 通过 `optionalDependencies`（`@lydell/node-pty-<os>-<arch>`）分发各平台预构建二进制，只安装当前平台的二进制、绝不调用 node-gyp，并原样转发 node-pty API。它是 node-pty 的发行版，不是另一套 PTY 实现。

## 使用

```ts
import { UniPty } from "unipty";
import { createNodePtyBackend } from "@unipty/backend-node-pty";

// 一次性底层加载（拉起平台预构建插件）；此后一切都是同步的。
const backend = await createNodePtyBackend();

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

获取是显式的：`await import()` + `createNodePtyBackend()` 始终是确定性路径；`@unipty/backend` 的 `autoResolveUniPtyBackend()` 只是便利封装。元数据从 `@unipty/backend-node-pty/unipty.metadata` 无副作用导出（schema 1；导入它不会加载任何原生插件、不会创建任何 pty）。

## 选项

```ts
createNodePtyBackend({
  encoding?: "buffer" | "utf8", // 默认 "buffer"
  writeDecode?: true | TextDecoder,
  name?: string, // 传给底层；成为子进程中的 $TERM
})
```

| 模式                               | Endpoint `native`                    | 输出分块                                                    | 输入接受                                     |
| ---------------------------------- | ------------------------------------ | ----------------------------------------------------------- | -------------------------------------------- |
| `encoding: "buffer"`（默认）       | `{ input: "both", output: "bytes" }` | `{ kind: "bytes", bytes }`（`Buffer` 以 `Uint8Array` 透传） | 文本与字节；底层自行把字符串编码为 UTF-8     |
| `encoding: "utf8"`                 | `{ input: "text", output: "text" }`  | `{ kind: "text", text }`                                    | 仅文本；字节写入以 `unsupported` 失败        |
| `encoding: "utf8"` + `writeDecode` | `{ input: "both", output: "text" }`  | `{ kind: "text", text }`                                    | 文本与字节；字节流经一个有状态的适配器解码器 |

`writeDecode: true` 安装非致命 UTF-8 `TextDecoder`；传入你自己的 `TextDecoder` 时会复制其
encoding/fatal/BOM 配置到**每个 PTY 独立**的有状态解码器——解码器状态绝不在 PTY 间共享。致命解码失败以 `invalid-argument` 拒绝整个值，原始 `TypeError` 作为 `cause`。`encoding: "buffer"` 时给出 `writeDecode` 会被拒绝——字节原生输入本来就接受字节。

写入就绪：每个 Endpoint 拥有有界的准入队列（默认 1 MiB，四分之三处为软恢复水位；可用 `writeQueueBytes` 调整）。整值移交给底层，因此超过软水位后 `write()` 返回 `false`（暂停建议；降回水位后 `drain()` 完成），硬上限处以 `backpressure` 拒绝整个值——绝不部分接受。`drain()` 是就绪恢复，不是物理冲刷：底层自身的 fd 写队列没有完成信号。

## 本适配器映射（并如实记录）的底层行为

依据已安装的 `@lydell/node-pty` 1.2.0-beta.15 源码验证：

- **`close()` = 传输释放，不发送信号。** 底层的公开 `destroy()` 会在关闭 socket 后显式发送 `SIGHUP`（unix）或调用 `kill()`（Windows），那会把 close 级联成终止。本适配器改为直接销毁主侧 socket 并释放底层自带的写流：fd 关闭、子进程不被信号、退出观察保持待定直到子进程真正死亡。
- **`terminate()` = 以底层默认信号 `kill()`**（unix 为 `SIGHUP`；Windows 为 agent 关闭）。底层吞掉 `ESRCH`，因此幂等。传输保持打开。
- **`exited`** 只包装一次 `onExit`。unix 把 `signal` 报告为数字（`0` = 无信号）；非零数字映射为观测到的字符串形式（`"SIGTERM"`）。底层只在 socket 关闭后才发出 exit（带 200 ms 兜底超时），因此退出观察可能滞后子进程死亡零点几秒。
- **exec 失败是退出观察，不是 spawn 异常。** 底层先 fork 再 exec；可执行文件缺失会立即产出 `{ exitCode: 1, signal: null }` 而不是抛错。只有参数形状的错误才表现为类型化的同步 spawn 失败（`invalid-argument` / `unsupported`，原始错误作为 `cause`）。
- **几何与 resize** 以真实 tty winsize 更新到达子进程。
- **输出背压传导到内核。** Core 侧数据源消费不及时时暂停主 socket、拉取时恢复，消费停滞不会撑大无界的适配器队列。
- **传输 EOF 与读错误可区分。** 主 socket 读失败会使输出源出错（`unsupported`，原始错误作为 `cause`）；只有干净关闭才正常完成。

## 部署

- 预构建原生插件随 `@lydell/node-pty` 的平台 `optionalDependencies` 分发；用常规包管理器安装本包即可物化正确的二进制。不要用 `--omit=optional`，也不要跨操作系统复制 `node_modules`。
- 在宿主打包配置中保持本包**外部且对解析器可见**（与任何原生插件包相同的规则）：打包或迁移产物模块会割裂底层的包树。打包部署请用 `@unipty/helper-backend` 生成带延迟 loader 的显式 Backend manifest。
- 纯 Node 部署叙事：无 FFI、无运行时开关、无权限、支持的平台无安装后编译。

## 支持状态

元数据只声明到运行时级别（`targets: [{ runtime: "node" }]`）；`os`/`arch` 保持开放。一个元组只有伴随精确包版本发布的公共契约证据（见发布目录）才算 **verified**。缺乏证据时元组为 _declared-unverified_——声明只用于预筛选择，绝不承诺原生可加载。

## 许可证

MIT。
