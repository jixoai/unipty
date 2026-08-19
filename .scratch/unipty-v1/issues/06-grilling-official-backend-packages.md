Type: grilling
Status: resolved

> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): official routes,
> factories, acquisition convenience, compatibility governance, release evidence.

Part of: [UniPty v1 Wayfinder Map](../map.md)

Blocked by: 02, 05

## Question

确定 v1 官方 Backend 包的最小集合、命名与工厂规范、runtime/platform support
声明、第三方 Backend 的兼容边界，以及哪些包只应作为候选或实验性发布。

## Confirmed Decisions

- 官方 Backend package 的主 acquisition 入口统一为
  `createXxxBackend(options): Promise<XxxBackend>`。
- Core 只接收 ready Backend object，不进行自动探测、字符串 registry 或隐式
  fallback。
- Bun runtime family 只使用一个 Backend package：`@unipty/backend-bun`，底层
  为 Bun 原生 `Bun.Terminal`；不创建 OS-specific Backend package。它统一要求
  Bun `>=1.3.14`，目标覆盖 Linux、macOS、Windows。
- 第一阶段必须同时实现并交付 Node、Bun、Deno 三条 Backend 路线；三者都要
  进入实现、文档、CI contract suite 与发布验收。逐 tuple 的验证门槛限制的是
  support claim，不是把其中某条路线延期到后续阶段的理由。
- Node 路线正式包名为 `@unipty/backend-node-pty`，主入口为
  `createNodePtyBackend(options): Promise<NodePtyBackend>`；PTY-FFI 路线正式
  包名为 `@unipty/backend-deno-sigma__pty-ffi`，主入口为
  `createDenoSigmaPtyFfiBackend(options): Promise<DenoSigmaPtyFfiBackend>`。
  后者明确指向第三方技术包 `@sigma/pty-ffi`，runtime metadata 标记为 Deno，
  Rust substrate 为 `portable-pty`；不得把 Deno 平台名单独伪装成底层实现名或
  runtime 官方 API。
- `@unipty/backend-deno-sigma__pty-ffi` 只发布 npm 包，不要求消费者配置 JSR registry，
  也不双发布。pnpm build 将 `@sigma/pty-ffi/noinit` 所需 JavaScript closure 与目标
  动态库内建进 npm tarball，发布 runtime 不得残留 `jsr:` import。Backend factory
  私有地选择 exact tuple 资产并显式初始化；packed npm artifact 的 Deno 公共契约测试
  才能建立 release evidence。
- `@unipty/backend` 是独立的 convenience package，负责提供
  `autoResolveUniPtyBackend` 入口，简化常用 Backend 获取；它不改变 Core 只接收
  ready Backend 的边界。
- AutoResolve 的候选算法已经确定：先分析当前 runtime；如果提供了
  `candidates: string[]`，先按 candidates 解析可用依赖，全部不可用时向终端发出
  warning，再从消费项目 `package.json` 的依赖信息推导 `fallbackCandidates` 并继续
  resolve。没有 candidates 时直接进入 fallbackCandidates 阶段。
- `resolveUniPtyBackend(packageName)` 是公开的纯分析函数：每次只使用当前 runtime
  的原生 resolver 解析一个 package specifier 及其 metadata 子路径，不 import、
  不初始化 Backend，也不假装从 Node 进程复现 Bun 或 Deno 的解析规则。跨 runtime
  分析必须在目标 runtime 下运行，或消费静态 catalog/manifest。
- `inspectUniPtyBackend(resolution)` 只接收 successful resolution，import
  `./unipty.metadata` 并检查 Core protocol 与当前 runtime/platform；`autoResolveUniPtyBackend()` 只对最终选中项
  import 主入口并调用对应的异步 factory。用户始终可以绕过 `@unipty/backend`，
  直接 `await import()` 加 factory 获取 ready Backend。

## Compatibility Governance

```text
package namespace       repository/release ownership
protocol.core           hard Core compatibility
metadata.targets        declared runtime/platform eligibility
catalog evidence        verified support presentation
candidate order         acquisition policy
```

- `@unipty/backend-*` namespace 只表示 UniPty 官方发布所有权。第三方 Backend 使用
  自己的 package 名，通过相同 metadata/factory contract 获得 autoResolve 兼容性；
  metadata 不允许自证 `official` 或 `community`。
- Backend metadata 必须声明 `protocol.core`。v1 Core protocol major 为 `1`；缺少
  `1` 时 inspection 直接返回 `incompatible`。该值独立于 metadata schema 和 npm
  package semver。
- `metadata.targets` 只声明可尝试的 runtime 与可选 OS、arch、libc 范围，
  用于无副作用预筛选；它不是验证证据，不能证明 native module 可 load 或 Backend
  factory 可 ready。
- `stable`、`experimental`、`verified` 等展示标签不进入 runtime metadata，也不参与
  AutoResolve 排序。官方站点的 verified 状态只来自 repository-owned conformance
  records；package 自述和命名空间都不能建立该状态。
- 显式 candidates 的数组顺序与 fallback 的唯一兼容候选规则，是 AutoResolve 唯一
  的选择权威。official、community、版本新旧或验证状态都不产生隐式优先级。

## Evidence Refresh

核验日期：2026-08-18。

- 用户记忆中的“`Bun.Terminal` 不支持 Windows”对应旧状态：Bun v1.3.13
  首次为 Linux、macOS 提供该 API；Bun v1.3.14 才新增 Windows ConPTY
  实现。当前 Bun 文档明确将 Windows 列为内置 PTY 支持平台。
- `@oven/bun-windows-x64`、`@oven/bun-windows-x64-baseline` 是 Bun runtime
  的 Windows 平台二进制分发包，不是独立 PTY library 或另一个 Backend
  contract；npm registry 中不存在名为 `bun-windows` 的公开包。
- `@sigma/pty-ffi` 是 Deno-oriented FFI package：TypeScript 层直接使用
  `Deno.dlopen`、`Deno.ForeignLibraryInterface` 等 Deno API，Rust 动态库包装
  `portable-pty`，并要求 `--allow-ffi`。它可分发 Linux、macOS、Windows
  动态库，但这表示“Deno 跨 OS”，不表示“Node/Bun/Deno 跨 runtime”。

Primary evidence:

- [Bun v1.3.13: Bun.Terminal for Linux and macOS](https://bun.com/blog/bun-v1.3.13)
- [Bun v1.3.14: Bun.Terminal on Windows through ConPTY](https://bun.com/blog/bun-v1.3.14)
- [Bun child-process PTY platform differences](https://bun.com/docs/runtime/child-process#platform-differences)
- [`@sigma/pty-ffi` upstream README](https://github.com/sigmaSd/deno-pty-ffi)
- [`@sigma/pty-ffi` Deno FFI loader](https://github.com/sigmaSd/deno-pty-ffi/blob/master/src/ffi.ts)

## Resolution

官方身份、协议兼容、目标声明、验证证据与 acquisition policy 已物理分层。这个票
不再承载未决产品选择；runtime probes、CI matrix 与 catalog 生成属于实现验收。
