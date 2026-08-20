# UniPty

**面向 Node、Bun、Deno 的运行时无关 PTY —— 一套公共契约，可由开发者显式选择的 Backend。**

[![CI](https://github.com/jixoai/unipty/actions/workflows/ci.yml/badge.svg)](https://github.com/jixoai/unipty/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) | 简体中文

Node、Bun、Deno 各自暴露了不同的 PTY 底层实现——安装模型、I/O 表示、生命周期语义、原生部署约束都不同。UniPty 把这些收敛为**一套小而诚实的契约**：应用显式选择 Backend，所有底层差异都留在 Core 私有的接缝之后。没有隐式 shell 执行，不会静默回退到管道，也不做运行时替换。

```ts
import { UniPty } from "unipty";
import { createNodePtyBackend } from "@unipty/backend-node-pty";

const backend = await createNodePtyBackend(); // 一次性就绪
const unipty = new UniPty({ backend });

const pty = unipty.spawn(["/bin/sh", "-i"], {
  cwd: process.cwd(),
  terminal: { cols: 120, rows: 40 },
});

for await (const text of pty.stream({ encoding: "utf8" })) {
  process.stdout.write(text);
}
pty.write("echo hello\n"); // 布尔写入就绪
pty.resize(80, 24);        // 仅字符单元格
pty.terminate();           // 终止请求，绝不级联 close
pty.close();               // 传输关闭，绝不杀死子进程
const { exitCode, signal } = await pty.exited; // 独立观察
```

## 特性

- **结构化启动** —— Bun 风格 `spawn(argv, options)`，argv 为非空参数向量。没有字符串命令重载、没有隐式 shell；元字符只是普通数据。
- **表示选择的流** —— `pty.stream({ encoding: "utf8" | "bytes" })`。UTF-8 视图优先使用原生文本，否则增量解码字节；字节视图只产出原生字节——重新编码的文本绝不冒充原始输出。
- **布尔写入就绪** —— `write()` 返回 `true`/`false`（两者都表示完整接受；`false` 只是建议 `drain()`）；饱和时以类型化的 `backpressure` 失败拒绝整个值。绝不部分接受、绝不静默丢弃。
- **非级联生命周期** —— `close()` 与 `terminate()` 幂等、同步、相互独立；退出观察在两者之后依然有效。
- **优雅释放** —— `unipty.dispose()` 立即阻止新 spawn，等待所有存活 PTY 关闭后恰好一次释放 Backend。
- **类型化能力扩展** —— 不透明 token 查找（`pty.capability(token)`）按对象身份匹配；没有字符串注册表。
- **证据门控的支持声明** —— 仅当公共一致性套件针对**已安装的包制品**全部通过时，一个运行时/平台元组才是 `verified`。其余一律诚实地标为 `declared-unverified` 或 `not-targeted`。

## 官方第一阶段路由

| 包 | 运行时 | 底层实现（如实声明） |
| --- | --- | --- |
| [`@unipty/backend-node-pty`](packages/backend-node-pty) | Node | 第三方 `node-pty`（经 `@lydell/node-pty` 预构建发行版） |
| [`@unipty/backend-bun`](packages/backend-bun) | Bun | 运行时原生 `Bun.Terminal`（POSIX ≥ 1.3.13，Windows ≥ 1.3.14） |
| [`@unipty/backend-deno-sigma__pty-ffi`](packages/backend-deno-sigma__pty-ffi) | Deno | 第三方 `@sigma/pty-ffi`（Rust `portable-pty`），整体内嵌为自包含 npm 制品 |

Node 路由适配的是第三方库——不是 Node 运行时原生 API，文档绝不如此宣称。Deno 只是最后一条路由的运行时元数据，不是其实现身份。

## 包一览

| 包 | 说明 |
| --- | --- |
| [`unipty`](packages/unipty) | 公共 Core：`UniPty`、`Pty`、Backend/Endpoint 接缝、公共错误 |
| [`@unipty/backend`](packages/backend) | 获取便利层：`resolveUniPtyBackend`、`inspectUniPtyBackend`、`autoResolveUniPtyBackend`、manifest 构造器 |
| [`@unipty/helper-backend`](packages/helper-backend) | 构建期 manifest 生成器（`unipty-helper-backend manifest`） |
| `@unipty/backend-*` | 上述三条官方 Backend |
| [`@unipty/conformance`](packages/conformance) | 私有已安装包一致性测试装置、证据写出器、发布目录聚合器 |
| [`@unipty/www`](packages/www) | 私有静态文档站点 → [unipty.jixoai.com](https://unipty.jixoai.com) |

## 获取 Backend

手动导入是一等路径——Core 永远不需要获取层：

```ts
const backend = await createBunBackend(); // 或任意官方工厂
const unipty = new UniPty({ backend });
```

需要确定性发现时，`@unipty/backend` 将工作分段：纯解析（不导入）、仅元数据检查（不初始化）、然后是选定候选的初始化——其失败是终止性的且结构化的：

```ts
import { autoResolveUniPtyBackend } from "@unipty/backend";

const backend = await autoResolveUniPtyBackend({
  candidates: ["@unipty/backend-node-pty"], // 有序偏好
  from: import.meta.url,                     // 调用方为根的基址
});
```

打包部署场景改为提供显式不可变 manifest（`defineUniPtyBackendManifest()`），
由 `unipty-helper-backend manifest --candidate <pkg> --out backend-manifest.ts`
生成。完整分段契约见[获取层 README](packages/backend/README.md)。

## 契约速览

| 面 | 语义 |
| --- | --- |
| `spawn(argv, options)` | 同步；argv 是结构化数据；几何按维度独立解析（显式 → `COLUMNS`/`LINES` → 宿主 TTY → 80×24） |
| `stream({ encoding })` | 每 PTY 一个活跃视图（否则 `active-stream`）；取消仅脱离该视图 |
| `write(data)` / `drain()` | 布尔就绪；整值接受；类型化饱和 |
| `resize(cols, rows)` | 有限正整数（字符单元格）；不支持时显式失败 |
| `close()` / `terminate()` | 幂等、同步、非级联 |
| `exited` | 可重复 await 的 `{ exitCode, signal }`，独立于流完成与 close |
| 错误 | 稳定 `error.code`：`unsupported`、`closed`、`backpressure`、`invalid-argument`、`active-stream` |

## 一致性与兼容性证据

每一条支持声明都经过同一接缝：公共一致性套件针对**已安装的包制品**运行（pack、安装进隔离消费者、只经公共导出驱动）。原生全量通过产出一条正向 Verification Evidence 记录；确定性聚合器校验身份/元组/提交唯一性并产出发布目录，文档站点**原样**消费它。失败只是 CI 诊断——绝不会变成永久的「不支持」声明。

本地运行：

```sh
pnpm --filter @unipty/conformance run conformance --backend node-pty --emit-evidence
```

## 文档与社区

- **站点**：<https://unipty.jixoai.com>（GitHub Pages，消费发布目录）
- **规格**：[`openspec/specs/`](openspec/specs) 下的六份能力规格
- **Issue / 讨论**：<https://github.com/jixoai/unipty/issues>
- **路线**：v1 聚焦 PTY；持久化、重连、远程主机属于可替换 Backend 与 wrapper，而不是第二套插件生命周期。

## 开发

```sh
corepack pnpm install
pnpm build && pnpm typecheck && pnpm test
pnpm --filter @unipty/backend-bun test      # Bun 套件（需要 Bun）
cd packages/backend-deno-sigma__pty-ffi && deno test -A test/   # Deno 套件
pnpm check:arch                             # 包图所有权规则
```

## 许可证

[MIT](LICENSE)
