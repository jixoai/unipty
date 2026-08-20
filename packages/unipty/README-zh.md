# unipty

[English](./README.md) | 简体中文 · [GitHub](https://github.com/jixoai/unipty) · [文档站点](https://unipty.jixoai.com)

运行时无关的 PTY 核心：提供公共 `UniPty` / `Pty` 契约、面向适配器作者的 Backend/Endpoint 接缝、公共错误与能力 token。Core 独占全部可观测 PTY 行为；具体 Backend 只负责各自的底层实现。

## 安装

```sh
pnpm add unipty @unipty/backend-node-pty   # 或 Bun / Deno 路由
```

Core **不依赖任何** Backend：你注入的是一个已经就绪的 Backend。

## 使用

```ts
import { UniPty } from "unipty";
import { createNodePtyBackend } from "@unipty/backend-node-pty";

const backend = await createNodePtyBackend();
const unipty = new UniPty({ backend });

// 结构化启动：没有字符串命令重载，没有隐式 shell。
const pty = unipty.spawn(["/bin/sh", "-i"], {
  cwd: process.cwd(),
  env: { ...process.env, TERM: "xterm-256color" },
  terminal: { cols: 120, rows: 40 },
});

// 每个 PTY 一个活跃流；显式选择表示形式。
const reader = pty.stream({ encoding: "utf8" }).getReader();
// pty.stream({ encoding: "bytes" }) → ReadableStream<Uint8Array>（仅原生字节）

// 布尔写入就绪：任一取值都表示整段输入已被完整接受。
const ready = pty.write("ls -la\n");
if (!ready) await pty.drain(); // 暂停建议，绝不是重试指令

pty.resize(80, 24); // 有限正整数（字符单元格）
pty.terminate(); // 同步终止请求；不会关闭传输
pty.close(); // 发布 closed 状态；不会终止子进程

const { exitCode, signal } = await pty.exited; // 独立于流与 close

await unipty.dispose(); // 立即阻止新 spawn，等待各 PTY 关闭后一次性释放 Backend
```

## 公共面

| 导出                                                                      | 职责                                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `UniPty<TBackend>`                                                        | 配置好的 Core 实例；`backend`、同步 `spawn()`、优雅 `dispose()`                              |
| `Pty`                                                                     | `stream`、`write`、`drain`、`resize`、`close`、`terminate`、`exited`、`closed`、`capability` |
| `UniPtyError` / `UniPtyErrorCode`                                         | 稳定失败判别码：`unsupported`、`closed`、`backpressure`、`invalid-argument`、`active-stream` |
| `ReadyPtyBackend`、`BackendEndpoint`、`StructuredLaunch`                  | Backend 作者接缝（见下）                                                                     |
| `NativeChunk`、`NativeInput`、`NativeRepresentation`、`BackendExitResult` | 带标签的原生数据面                                                                           |
| `CapabilityToken`、`defineCapabilityToken`                                | 不透明、按身份匹配的扩展 token                                                               |
| `UNIPTY_CORE_PROTOCOL_MAJOR`                                              | Backend 声明兼容的 Core 协议身份                                                             |

### 值得了解的语义

- **几何**按维度独立解析：显式 `terminal` 值 → 有效宿主 `COLUMNS`/`LINES` → 可信宿主 TTY → `80 × 24`；显式非法值以 `invalid-argument` 失败。
- **流取消仅脱离视图**：输入、传输、子进程都保持存活；后续视图只看到订阅之后的输出；首视图建立前的启动输出保留在有界 bootstrap 缓冲中。
- **背压是建议性的**：`false` 不锁定后续写入；饱和时以 `backpressure` 拒绝整个值——绝不部分接受、绝不无界累积。
- **`close()` / `terminate()` 永不级联**；已建立的退出观察在 close 之后仍会结算。

## 写给 Backend 作者

实现就绪 Backend 接缝，把就绪对象交给 Core：

```ts
import type { ReadyPtyBackend, BackendEndpoint, StructuredLaunch } from "unipty";

function createMyBackend(): Promise<MyBackend> {
  /* 一次性就绪 */
}

class MyBackend implements ReadyPtyBackend {
  spawn(launch: StructuredLaunch): BackendEndpoint {
    // 同步；类型化启动失败；一个有序 NativeChunk 输出源、
    // 可重复 await 的 exited、write/drain/resize/close/terminate。
  }
  async dispose(): Promise<void> {}
}
```

Endpoint 法则：你只提供原生传输事实——公共流、转换、bootstrap 缓冲、背压语义、公共错误与生命周期状态全部由 Core 拥有。官方路由应暴露 `./unipty.metadata` 子路径与异步 `createXxxBackend(options)` 工厂，并声明 `protocol.core: [1]`。

## 测试

```sh
pnpm --filter unipty test   # 基于内存 Endpoint 的 102 个单元场景
```
