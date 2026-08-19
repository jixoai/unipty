Type: research
Status: resolved

> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): resolver evidence,
> candidate declaration, effect boundary, bundle ownership, subsequent decisions.

Part of: [UniPty v1 Wayfinder Map](../map.md)

## Question

调查 `@unipty/backend` 的 autoResolve 可依赖的一手运行时与 npm 生态事实：
Node/npm/pnpm、Bun、Deno 对 `package.json`、`node_modules`、optional
peerDependencies、`import.meta.resolve`、`createRequire`、runtime resolver、
bundler externalization 与 native addon 分发的行为。目标是判断如何基于“已声明且
可解析的 Backend 包”实现确定性自动选择，而不是盲扫文件系统或把不可 bundle 的
二进制误认为可随 JS 一起打包。区分事实、测量、推断和待讨论的产品决策。

## Answer

研究日期：2026-08-18。以下事实来自 runtime、package manager、bundler 与
Termless 的一手文档或源码；“建议”仍需后续 HITL 决策，不能自动升格为产品行为。

### 当前可复用的事实

| Area     | Fact                                                                                                                                                                                              | Consequence for UniPty                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Node     | [`import.meta.resolve`](https://nodejs.org/api/esm.html#importmetaresolvespecifier) 是 module-relative resolver，遵守 package `exports`；它同步返回 URL，但对不存在的 `file:` target 不一定抛错。 | 必须从消费项目的明确 base 解析 package，且在 resolve 后仍以实际 import/load 验证可用性。                                     |
| Bun      | [`Bun.resolveSync(specifier, root)`](https://bun.com/docs/runtime/utils#bun-resolvesync) 以显式 root 使用 Bun 的模块解析算法；没有匹配时抛错。                                                    | Bun 可使用 caller/project root，而不是 Backend resolver 自己的安装目录。                                                     |
| Deno     | [`import.meta.resolve`](https://docs.deno.com/api/web/~/ImportMeta.resolve) 按 Deno 的 import 规则解析，并考虑已应用的 import map。                                                               | Deno resolver 不能假定存在 npm-style 平铺 `node_modules`；要尊重 Deno 项目的 resolver / import map。                         |
| npm      | [`peerDependenciesMeta.optional`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#peerdependenciesmeta) 只把 peer 标成可选，npm 不会自动安装它。                                     | `@unipty/backend` 不能把 optional peer 当成“已经装好、可 autoResolve”的 Backend 清单。                                       |
| pnpm     | [pnpm 的 package metadata](https://pnpm.io/package_json#peerdependenciesmetaoptional) 保留 optional peer 语义，并使用链接/virtual store 组织依赖。                                                | 不应靠目录扫描推断可用 Backend；应使用从消费项目 base 出发的标准 resolver。                                                  |
| Bundling | [esbuild 的 package API](https://esbuild.github.io/api/#packages) 将 package bundling 与 externalization 作为构建配置，而非 runtime discovery 协议。                                              | native addon、FFI dylib 和外部 binary 的保留必须是 deployment/build contract；autoResolve 不负责在 bundle 内猜测或下载它们。 |

### Termless 当前做法

Termless 的 public docs 明确区分两条路径：**显式 factory 是首选**；
`@termless/core` 的 `await backend(name)` 是 convenience registry，用于处理
WASM/native 初始化。其名称不是从文件系统扫出来的：core 内维护一组已知 backend
name 到 package importer 的映射，未知 name 直接失败。CLI 再提供 `backends`、
`backends install` 和 `doctor` 来显示安装状态、安装已知包、检查版本或缺依赖。
这些是 Terminal Emulator Backend 的机制，不是 PTY host 的通用自动发现协议。

- [Termless Backend capability and selection guide](https://termless.dev/guide/backends.html)
- [Current registry source](https://raw.githubusercontent.com/beorn/termless/main/src/backend/backends.ts)

### 对 UniPty 的设计边界

1. 不存在可以直接复用的“行业通用插件自动发现”规范；成熟的共同点是**显式 factory
   始终可用**，convenience path 只在已知候选集合中解析。
2. `@unipty/backend` 不应递归扫描 `node_modules`、读取 transitive dependency tree，
   或联网安装 package。pnpm、Deno import map、bundle deployment 都会让这些猜测
   不稳定或不安全。
3. 实用候选是“声明 + resolver”而不是“目录扫描”：消费项目显式声明候选 Backend，
   `@unipty/backend` 从 caller/project base 使用 runtime-native resolver 查找它们，
   然后动态 import 已解析 package 并调用该 package 的 async factory。
4. Bundled deployment 需要 build-time generated registry 或显式 external list；
   native assets 的 materialization 由 Backend package 与发布工具负责，不能由
   runtime autoResolve 补救。

### Confirmed Subsequent Decisions

- 候选先来自调用方的 ordered `candidates`，不可用时才从 consumer `package.json`
  dependencies 推导 fallback；fallback 只能有一个 compatible 候选，多个为 `ambiguous`。
- `resolveUniPtyBackend(packageName, { from })` 每次只处理一个 package，纯 resolver
  必须要求显式 `from: URL`；autoResolve 只能从可信 project context 推导默认值，嵌入式
  library、bundle 和 Deno import-map 调用方必须显式传入。
- 选择前按 `resolve -> inspect` 继续尝试；选中后 `import -> factory -> ready` 失败即
  terminal，不隐式 failover。manual import + factory 仍是完整的一等路径。
- bundle 用显式 `UniPtyBackendManifest` 取代 runtime resolver。native asset
  externalization 属于 Backend/host build；v1 不存在 public 或 helper-internal
  asset report，helper 只生成显式 Backend manifest。
