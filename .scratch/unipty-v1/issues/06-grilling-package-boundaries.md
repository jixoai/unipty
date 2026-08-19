Type: grilling
Status: resolved

Part of: [UniPty v1 Wayfinder Map](../map.md)

Blocked by: 01, 02, 03, 05

## Question

确定 UniPty core、官方 runtime/backend 包、backend-wrapper 包、Shell Parser 包和 conformance suite 的发布边界、依赖方向、版本兼容与文档责任，使第三方可以实现 Backend 而不依赖私有内部模块。

## Confirmed Package Graph

```text
                         +---------------------------+
                         | packages/www (private)    |
                         | docs + generated catalog  |
                         +-------------^-------------+
                                       |
                   repository conformance records only
                                       |
unipty <--------------------- private conformance workspace
  ^  ^
  |  +-------------------- @unipty/backend
  |                            ^
  |                            |
  |                    @unipty/helper-backend
  |
  +-- @unipty/backend-bun
  +-- @unipty/backend-node-pty
  +-- @unipty/backend-deno-sigma__pty-ffi
  +-- community Backend / backend-wrapper packages
```

- `unipty` 是唯一 Core runtime package，发布 `UniPty`、`Pty`、`PtyBackend`、公共
  options、exit result 与稳定错误码。它不依赖任何具体 Backend、resolver、parser、
  website 或 conformance implementation。
- 具体 Backend package 依赖 Core 的 public contract，并通过 peer dependency 与
  `protocol.core` 同时表达 package-manager compatibility 和 runtime protocol
  compatibility；不得 import Core private modules。
- Deno 官方 Backend 的 npm 包同时拥有 vendored `@sigma/pty-ffi/noinit` runtime closure
  与目标动态库；该私有资产树不是 Core、metadata、resolver、manifest 或 helper 的
  dependency/interface。宿主 JS bundle 默认 externalize 此 Backend package。
- `@unipty/backend` 只负责 metadata schema、resolve/inspect/autoResolve 与显式
  bundle manifest，不依赖任一候选 Backend，也不改变 Core 的显式注入 seam。
- `@unipty/helper-backend` 是开发期工具，只依赖 `@unipty/backend` 的 public
  manifest/metadata interface；生成源码，不成为应用 runtime dependency。
- v1 conformance harness 保持 repository-visible、workspace-private。它必须覆盖三个
  官方 Backend，但在 interface 经过真实第三方实现验证前不增加一个浅的 npm package。
- `packages/www` 为 private workspace app。它只消费公开文档、生成的 API reference
  与 repository-owned conformance catalog，不参与任何 runtime dependency graph。
- backend-wrapper 是普通 Backend package。它可以依赖被包装的 Backend 或外部系统，
  但 Core 不为 wrapper 引入第二套注册、持久化或连接生命周期。

## Version Compatibility

```text
npm semver / peerDependencies  -> 安装与升级提示
metadata.schema               -> metadata 读取兼容
metadata.protocol.core        -> Core/Backend 硬协议兼容
metadata.targets              -> 当前 runtime/platform 预筛选
conformance record            -> 已验证支持证据
```

- 这些版本面不得互相代替。尤其不能从 package semver 推导 protocol major，也不能从
  `targets` 推导 verified support。
- v1 不设计跨 protocol-major compatibility shim。新 Core protocol major 若需要旧
  Backend，必须由独立 adapter/package 显式实现。
- `autoResolveUniPtyBackend()` 返回动态的公共 `PtyBackend` 类型；需要保留具体 Backend
  类型的调用方使用手动 import + `createXxxBackend()`，再传给 `new UniPty({ backend })`。

## Parser Ecosystem Boundary

- `@unipty/shell-parser` 与 `@unipty/powershell-parser` 是正式生态方向，但不属于 v1
  Core/三 runtime Backend 的发布阻塞项。
- 两个 parser 只共享顶层结果分类，不共享 AST package，也不成为 Core dependency。
- Parser packages 不执行输入；调用方负责把 direct argv 或显式 Shell Script Request
  组合进 `unipty.spawn()`。
