# UniPty v1 Wayfinder Map

> Orthogonal tracking intents (maintained 2026-08-19 Asia/Shanghai): public PTY
> contract, Backend seam, acquisition and bundling, evidence and release, optional
> ecosystem. The map links decisions without becoming an implementation plan.

Status: arrived
Spec: [living product spec](spec.md)

## Destination

锁定可发布的 UniPty v1 架构规范：运行时无关的 PTY 公共契约、开发者可选择或自定义的 PtyBackend 机制、显式结构化启动与 Shell Parser 边界，以及经过当前一手资料和可运行探针验证的 Node/Bun/Deno/OS/backend 事实矩阵。达到终点后，规范可以交给实现流程；本地图不直接实现产品。

## Notes

领域：跨运行时 PTY 与可替换 Backend 生态。

持续参考：`CONTEXT.md`、`i18n.zh.md`、[living spec](spec.md)、`prototype.md`；讨论遵循 `/grilling` 与 `/domain-modeling`，外部事实使用 `/research`，最终收敛使用 `$to-spec`。

规范已进入 `ready-for-agent`；后续实现若发现矛盾，仍先回写 living spec，再更新本索引。

## Decisions so far

- [Research Termless architecture](issues/01-research-termless-architecture.md) — Termless 的 Backend 是 VT emulator；其 PTY 只是 Node/Bun 适配，持久化、恢复和 multiplex 位于其运行时边界之外。
- [Research runtime PTY matrix](issues/02-research-runtime-pty-matrix.md) — Node、Bun、Deno 候选在安装、I/O、transport EOF、进程退出和 signal 上不可互换；Deno Node-API 加载不等于具体 PTY addon 通过。
- v1 聚焦 PTY；持久化、重连、远程生命周期属于可选 backend-wrapper，不是核心保证。[living spec](spec.md)
- Backend 是唯一需要的扩展机制；Shell Parser 是核心之外的官方生态包。[living spec](spec.md)
- 核心使用结构化启动请求；需要 shell 的文本必须产生显式 Shell Script Request，由调用方选择命名 shell 策略。[living spec](spec.md)
- 所有实现通过公开契约测试 seam 验收；当前 spec 已进入 `ready-for-agent`。[living spec](spec.md)
- [Research shell parser ecosystem](issues/03-research-shell-parser-ecosystem.md) — resolved。官方生态包固定为 `@unipty/shell-parser`（`unbash` 薄包装方向）与 `@unipty/powershell-parser`（官方 `Parser.ParseInput` adapter）；共享边界是分类结果，不是跨语言 AST。
- [Research Backend autoResolve](issues/07-research-backend-auto-resolve.md) — resolved。Node/Bun/Deno 都从明确 caller/project base 使用各自 resolver；npm optional peer 不代表已安装，pnpm 不可按目录扫描。Termless 使用已知-name registry + 显式 factory + CLI 安装/doctor，而非 PTY Backend 的盲发现；UniPty 已据此固定 caller-rooted 三阶段 acquisition、显式优先级与 manifest path。
- [Research resolver APIs](issues/08-research-resolver-apis.md) — resolved。`import.meta.resolve`、`createRequire().resolve`、`Bun.resolveSync` 与 Deno import-map 语义都必须以明确 caller `from`/`parent` 为基准；resolved、loaded、ready 三层不可合并；不扫描 `node_modules`。`./unipty.metadata` 是官方 Metadata Protocol；metadata 可静态导入 `#package.json`，但不能在求值时执行 package-scoped `#index` resolver。metadata 只含 identity、factory、protocol、targets 与 optional provenance，verified evidence 唯一来自 repository catalog/CI。
- [Research metadata runtime and bundle probes](issues/11-research-metadata-runtime-probes.md) — resolved。Node 24.19.0、Bun 1.3.14、Deno 2.9.5 通过 metadata/package-private import 探针；Bun 与 Deno code-splitting 保持 manifest loader 的 `0 -> 1` 延迟求值。Bun 负向 bundle 证明 metadata-time `import.meta.resolve("#index")` 离开原 package scope 后会失败，因此官方 metadata 只允许静态 `#package.json` 或等价 build-time normalization。
- [Explore www package](issues/09-www-package.md) — resolved。`packages/www` 是部署到 GitHub Pages 的静态官网，Owner 维护 `unipty.jixoai.com` CNAME；视觉风格以实现时的 sibling `../openspecui` 官网为参考，框架与具体 Pages workflow 由官网开发者现场调查。网站展示 repository-owned catalog 证据，不提供浏览器本地 PTY playground。
- [Grilling I/O and lifecycle contract](issues/04-grilling-io-lifecycle-contract.md) — 输出/输入表示、Web streams、背压、resize、独立 exit observation、close/terminate、signal capability 和 typed errors 已收敛；Backend 内部 teardown 顺序保持实现所有权。
- [Grilling PtyBackend contract](issues/05-grilling-backend-contract.md) — resolved。Ready Backend、Core-private Endpoint、同步 spawn、输入输出、退出观察、resize、非级联生命周期、graceful disposal、泛型 Backend 暴露与 capability token 均已收敛；token 严格按同一 loaded package-instance identity 匹配，重复安装副本返回 `undefined`，不做字符串 fallback。
- [Grilling official Backend packages](issues/06-grilling-official-backend-packages.md) — resolved。第一阶段必须同时交付 Node、Bun、Deno 三条路线，统一包名为 `@unipty/backend-*`：`@unipty/backend-bun`、`@unipty/backend-node-pty`、`@unipty/backend-deno-sigma__pty-ffi`；其底层第三方包为 `@sigma/pty-ffi`，Deno 是 runtime metadata。Package identity、protocol compatibility、catalog evidence 和 acquisition policy 相互正交。
- [Grilling package boundaries](issues/06-grilling-package-boundaries.md) — resolved。Core、Backend、resolver、helper、parser、catalog 与网站的发布/依赖图已固定；package semver、metadata schema、Core protocol、target declarations 和 conformance record 不得互相代替。
- [Architecture consolidation review](issues/10-architecture-consolidation-review.md) — resolved。移除了 metadata 的 support/capability/asset 负担、metadata 之外的 candidate loader 以及 inspect 重复 resolve；保留 capability token、三阶段 acquisition、manifest 和 helper，因为它们各自承担不可由调用方安全复制的 PTY/部署复杂度。
- [Compatibility catalog and CI](issues/12-architecture-compatibility-catalog.md) — resolved。每个 native matrix job 只在公共契约完整通过后产生 exact positive evidence；确定性 aggregator 快照 release metadata 并生成随 tag 发布的单一 catalog JSON。站点只展示 `verified | declared-unverified | not-targeted` 并原样消费显式 release artifact；catalog 永不参与 runtime selection。
- [Native asset and host bundler research](issues/13-research-native-asset-bundlers.md) — resolved。Bun/esbuild 的真实 `node-pty` spawn 与 Deno FFI path 探针证明三条路线不存在稳定共享的 asset schema，因此 v1 删除 public/helper-internal asset report。Deno 官方 Backend 固定为自包含 npm 包：pnpm build vendoring `@sigma/pty-ffi/noinit` JavaScript closure 与目标动态库，发布 runtime 不残留 `jsr:` import，packed npm artifact 才是验收面。

## Implementation handoff evidence

- 官方 Backend 的 packed-package native matrix、release catalog artifact 与站点消费链必须在实现阶段通过验收；架构与 artifact ownership 已固定，这些不再是 Wayfinder 设计项。

## Out of scope

- 在本地图内实现核心、Backend 或 parser 包。
- 核心托管持久会话、重连服务或第二套插件注册系统。
- 未经研究确认就承诺任何具体原生库、远程宿主或跨平台能力。
