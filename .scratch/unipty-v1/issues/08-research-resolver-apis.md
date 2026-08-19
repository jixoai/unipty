Type: research
Status: resolved

> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): resolver facts,
> metadata protocol, acquisition reports, bundle manifest, implementation probes.

Part of: [UniPty v1 Wayfinder Map](../map.md)

## Question

调查 Node、Bun、Deno 的官方模块解析原语，确认 `from`/`parent` 基准、纯解析与实际可加载性的边界，以及 `@unipty/backend` 是否应主动遍历 `node_modules`。

研究日期：2026-08-18。以下为官方文档或规范事实；最后的 UniPty 建议是基于这些事实的架构推断。

## 一手事实

| Runtime / API                                                              | 官方语义                                                                                                                                                                                                                                                                                                                                                                                                    | 对 autoResolve 的限制                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node `import.meta.resolve(specifier[, parent])`                            | [Node ESM docs](https://nodejs.org/api/esm.html#importmetaresolvespecifier) 定义它为相对于当前模块（或显式 `parent` URL）的同步解析器，并遵守 Node 的 `exports`、条件和 package resolution 规则。返回的是 URL 字符串；对不存在的 `file:` 目标，解析本身不保证抛错。Node 文档还说明该 API 是同步文件系统操作。                                                                                               | 适合作为“这个 specifier 按 Node 规则会解析到哪里”的纯分析步骤，但 `resolvedUrl` 不等价于模块可成功加载，更不等价于 Backend 的 native addon/FFI 已可初始化。随后仍需隔离的动态 import + factory readiness 验证。                   |
| Node `module.createRequire(filename).resolve(request)` / `require.resolve` | [Node Modules docs](https://nodejs.org/api/modules.html#requireresolverequest-options) 与 [`module.createRequire`](https://nodejs.org/api/module.html#modulecreaterequirefilename) 说明 CommonJS resolver 以传入 filename 所在位置为基准，使用 `require` 的 package lookup 与 `exports`/条件规则；找不到模块时抛 `MODULE_NOT_FOUND`。`createRequire()` 让 ESM 代码获得一个带明确基准的 CommonJS `require`。 | 当需要从“调用方文件”解析 package，Node 适配器应要求或推导一个明确的 `parent`/`from` URL，并通过 `createRequire(fileURLToPath(parent)).resolve(packageName)` 做 CJS 兼容解析。它不是跨 runtime API，也不能绕过 package `exports`。 |
| Bun `Bun.resolveSync(specifier, options)`                                  | [Bun runtime utils docs](https://bun.com/docs/runtime/utils#bun-resolvesync) 定义同步解析；`options` 支持显式 `root`，用于指定模块查找的根目录。失败时抛出解析错误。Bun 的解析仍由 Bun 自己的 package/exports/import-map 规则决定。                                                                                                                                                                         | Bun 适配器应把 UniPty 的 `from`/project base 转换为 Bun 的 `root`（或使用 Bun 当前模块基准），而不是扫描安装目录。返回路径只证明 Bun resolver 找到目标；native binary 与 factory readiness 仍需后续加载验证。                     |
| Deno `import.meta.resolve(specifier)`                                      | [Deno `ImportMeta.resolve`](https://docs.deno.com/api/web/~/ImportMeta.resolve) 按 Deno 的 import 规则解析相对于当前模块的 specifier。Deno 的模块加载还受 [import maps](https://docs.deno.com/runtime/fundamentals/modules/import_maps/) 和 [npm specifiers](https://docs.deno.com/runtime/fundamentals/node/#using-npm-packages) 影响；Deno 可从 npm/cache 解析，不应假定传统平铺 `node_modules`。         | Deno 适配器必须在 Deno 模块上下文中使用 `import.meta.resolve`，并保留 import-map/npm 语义。不能把 Node 的 `require.resolve` 或 `node_modules` 目录规则移植到 Deno。解析成功后仍需显式动态 import 与 Backend factory/`.ready()`。  |
| Import Maps（跨 runtime 可移植部分）                                       | [Import Maps specification](https://wicg.github.io/import-maps/) 规定的是模块 specifier 到 URL 的映射与解析算法；它不是一个列举已安装包、读取 package manifest 或验证 native loadability 的发现协议。                                                                                                                                                                                                       | UniPty 可以把 `specifier + parent URL` 作为抽象输入，但不能假设所有 runtime 共享同一 filesystem/package resolver。Import maps 只能影响支持它的 runtime 的解析结果。                                                               |
| Node package maps（前沿但非通用）                                          | [Node package maps](https://nodejs.org/api/packages.html#package-maps) 文档新增了 experimental package maps：用静态 JSON dependency map 控制 bare specifier 解析，目标之一是摆脱 `node_modules` 布局和 workspace hoisting。                                                                                                                                                                                 | 这进一步支持“显式 manifest/generated registry”方向，但它仍是 Node-only、experimental，不能成为 UniPty 的跨 runtime 公共 API。                                                                                                     |

## 关键边界：resolved ≠ loadable ≠ ready

```text
specifier + explicit parent/from
        │ runtime-native pure resolve
        ▼
resolved URL/path (按该 runtime 的 exports/conditions/import-map)
        │ dynamic import (仅选中的候选)
        ▼
module loaded
        │ createXxxBackend() / await backend.ready()
        ▼
ready Backend
```

三层必须分开记录：

1. **resolved**：解析器给出目标地址；Node 甚至可能对不存在的 `file:` URL 仍返回结果。
2. **loaded**：模块实际被 runtime 加载；这一步才会暴露 format、条件导出、权限或依赖错误。
3. **ready**：Backend factory 完成 native addon、FFI、连接或能力协商；这不是通用模块解析器能证明的。

因此 `resolveUniPtyBackend(packageName)` 应是无副作用、单候选、带显式 runtime 与 `from`/`parent` 的分析函数；`autoResolveUniPtyBackend` 只对选中的报告执行 import 和异步 factory。

## 为什么不主动遍历 `node_modules`

- Node 的 package `exports`、条件分支和 caller-relative lookup 意味着“目录中存在某包”不等于当前 specifier 可解析或可加载；直接拼路径会绕过 resolver 语义。
- pnpm 使用链接与 virtual store；包的物理位置不是稳定的公共 API。workspace、symlink、Plug'n'Play 或其他安装器甚至可能没有传统的 `node_modules` 布局。
- Deno 的 import map、npm/cache 与远程 URL 解析不以本地 `node_modules` 为发现边界。
- Bundler 可把 JS 打包、externalize package，或保留 native addon/FFI/dylib 为外部资产；构建产物中不一定存在可扫描的依赖目录。参见 [esbuild package/externalization](https://esbuild.github.io/api/#packages)。
- 递归扫描会把 transitive/optional 依赖误认为用户明确选择的 Backend，破坏候选顺序、可复现性与安全边界，并可能触发不应加载的 native code。

## UniPty 建议（架构推断）

1. 定义 runtime-neutral 分析输入：`packageName`、显式 `from: URL`，以及 runtime kind。纯 `resolveUniPtyBackend()` 要求调用方提供 `from`；`autoResolveUniPtyBackend()` 可以在明确的 runtime project context 中提供便利默认值，但不能把 resolver 自身安装位置冒充调用方。Bundle、Deno import-map 与 embedded-library 场景必须显式传入 `from`。
2. 每次只处理一个 package specifier。Node/Bun/Deno 各自调用原生 resolver；不得以“统一实现”重写 package lookup。
3. 报告至少区分 `resolved`、`loadable`（尚未尝试/已验证）与 `ready`；纯 resolve 函数不 import、不初始化。
4. `autoResolve` 先处理用户给出的有序 `candidates`；解析失败只产生诊断，按既定策略继续 fallback。每个候选先经过纯 `resolveUniPtyBackend()`，需要 runtime/platform 判断时再经过 `inspectUniPtyBackend()`；仅对最终选择的候选执行一次 Backend dynamic import + factory readiness。
5. `package.json` 依赖信息可作为 fallback candidate hints，但不是安装目录扫描协议；若 bundled deployment 需要发现，采用 build-time manifest/generated registry，并把 native assets 的 externalization 交给 Backend 包与发布工具。
6. 手动 `await import()` + `createXxxBackend()` 永远保留，作为跨 runtime、bundle 与诊断场景的确定性路径。

### Confirmed three-stage public acquisition API

`@unipty/backend` 的 convenience API 明确分为三个阶段：

```text
resolveUniPtyBackend(packageName, { from })
  -> package URL + metadata URL + resolution diagnostics

inspectUniPtyBackend(resolution)
  -> import metadata only + schema/support report

autoResolveUniPtyBackend(options)
  -> resolve -> inspect -> import package -> factory -> ready
```

`resolve` 不 import；`inspect` 只接收 successful resolution、不调用 factory、不加载
native、不建立连接；只有 `autoResolve` 的最终选中候选才进入 Backend readiness。

### Confirmed UniPty Backend Metadata Protocol

`package.json.exports` 子路径方案被确认作为 UniPty 自己的长期协议；它定义的是
**Backend metadata/build hook**，而不是一个通用的 npm 插件发现标准。官方 Backend
必须提供该入口，第三方 Backend 可以选择不提供。

官方 Backend 可以声明一个稳定子路径：

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./unipty.metadata": {
      "import": "./dist/unipty.metadata.mjs",
      "require": "./dist/unipty.metadata.cjs"
    }
  }
}
```

`./unipty.metadata` 模块应满足以下约束：

- 唯一必需的公共值是 default-exported `UniPtyBackendMetadata`，不要求 named export；
- 无副作用、不可初始化 native addon、不可建立连接、不可执行 Backend factory；
- 导出带 `schema` 版本的静态元数据：Backend identity、package、factory export
  名、Core protocol 与仅供无副作用预筛的 runtime/platform targets；
- 不把“当前物理包目录”、asset path 或 build externalization 当作公共事实。bundle 后
  不存在唯一的原始 `node_modules` 位置，资源物化仍由 Backend 与宿主 build 负责；
- `resolveUniPtyBackend()` 仍只解析这个子路径，不 import。若需要读取元数据，应在
  一个明确的 effectful inspect/selection 阶段 import metadata，再执行最终 Backend
  的 dynamic import 与 factory readiness；
- 未提供该子路径的第三方包仍可被单候选 resolver 解析，不因缺失 metadata 而被判定
  为不可用；但 autoResolve 不能猜测其 factory export，只有显式 manifest entry 才能
  携带可选择的 metadata 与 loader。手动 `await import()` 加 factory 仍是无 metadata
  包的确定性路径。

已确认的官方最小字段模型为：

```ts
interface UniPtyBackendMetadata {
  schema: 1;
  package: { name: string; version: string };
  backend: { id: string; factoryExport: string };
  protocol: { core: readonly number[] };
  targets: readonly {
    runtime: "node" | "bun" | "deno";
    os?: readonly string[];
    arch?: readonly string[];
    libc?: readonly string[];
  }[];
  provenance?: {
    kind: "runtime-native" | "third-party" | "external-system";
    substrate: string;
  };
}
```

`backend.factoryExport` 是官方包的必填字段。它让 autoResolve 在读取 metadata
后可以确定性地选择 factory，而不需要猜测默认导出、扫描模块成员或依赖包名约定。
该字段只声明导出名称；实际 `import`、factory 调用和 readiness 失败仍必须单独
报告。

`protocol.core` 是 Core protocol major 的硬兼容声明。v1 为 `[1]`；它独立于
metadata schema 和 npm semver。当前 Core major 不存在时 inspection 必须返回
`incompatible`。

`targets` 是唯一可用于 selection 前的环境声明：它只说明 Backend 作者意图覆盖的
runtime 与可选 OS/arch/libc 范围。OS 使用 Node `process.platform` / npm `os` token，
架构使用 Node `process.arch` / npm `cpu` token；`libc` 独立记录 `glibc`、`musl` 等
native-library 维度，不拼接为自定义平台字符串。它不表达 verified、maturity、能力、
asset strategy 或 official 身份；实际 import、factory ready 与公共操作结果始终优先。

`verified` 的唯一权威来源是 repository-owned compatibility catalog。每条 catalog
记录包含 exact runtime version、OS/arch/libc tuple、conformance suite identity、suite
version、commit、ISO-8601 timestamp 和可选 report reference。网站从 catalog 展示
证据；AutoResolve 不读取、不排序也不信任它。

### Confirmed report model

```ts
type BackendDiagnostic = {
  code: string;
  message?: string;
  cause?: unknown;
};

type BackendResolvedReport = {
  status: "resolved";
  packageName: string;
  packageUrl: string;
  metadataUrl?: string;
  diagnostics: readonly BackendDiagnostic[];
};

type BackendResolveReport =
  | BackendResolvedReport
  | {
      status: "unresolved";
      packageName: string;
      reason: "missing" | "invalid";
      diagnostics: readonly BackendDiagnostic[];
    };

type BackendInspectReport =
  | {
      status: "compatible" | "incompatible";
      resolution: BackendResolvedReport;
      metadata: UniPtyBackendMetadata;
      diagnostics: readonly BackendDiagnostic[];
    }
  | {
      status: "metadata-missing" | "metadata-invalid";
      resolution: BackendResolvedReport;
      diagnostics: readonly BackendDiagnostic[];
    };
```

`resolved` 只表示 runtime resolver 找到了目标 package；`metadataUrl` 为空时，包本身
仍可被手动 import，但 inspect 会得到 `metadata-missing`。`inspect` 只接受
`BackendResolvedReport`，不会再次调用 resolver 或将 package 缺失伪报为 metadata
缺失。`compatible` 只表示 metadata
通过 schema、Core protocol 与当前 target 的声明检查。两者都不等价于模块可加载、factory
可调用或 Backend ready。

### Confirmed warning sink

```ts
type BackendWarningSink = (warning: UniPtyBackendWarning) => void;

type UniPtyBackendWarning = {
  code: "candidate-unavailable";
  packageName: string;
  stage: "resolve" | "inspect";
  diagnostics: readonly BackendDiagnostic[];
  cause?: unknown;
};

autoResolveUniPtyBackend({
  onWarning?: BackendWarningSink;
});
```

未提供 `onWarning` 时，autoResolve 默认调用宿主 `console.warn`；提供后，warning
交付完全由调用方接管。`resolveUniPtyBackend()` 与 `inspectUniPtyBackend()` 永远
不写 console，也不调用 warning sink，只返回结构化 diagnostics。Warning 至少包含
candidate、stage、code 与 cause；diagnostic message 只是展示字段，不是稳定契约。

### Confirmed candidate ambiguity policy

- 显式 `candidates: string[]` 是有序优先级；第一个 `inspect` 为 `compatible` 的
  候选胜出，重复名称去重但保留首次出现的位置；
- 没有显式优先级时，`fallbackCandidates` 必须恰好产生一个 `compatible` 候选；
  零个进入普通失败，多于一个返回 `ambiguous`；
- `package.json` 属性顺序、`node_modules` 遍历顺序和 runtime 偶然顺序都不是优先级。

### Confirmed initialization-failure boundary

Candidate fallback 只发生在无副作用阶段：`resolve` 或 `inspect` 失败可以继续下一个
候选。一旦某候选被选中，Backend package import、`factoryExport` lookup/call 或
factory readiness 的失败都返回终止性初始化错误，不再悄悄尝试后续候选。错误报告
必须保留 selected package、失败 stage 与 structured cause；需要 failover 的调用方
自行编排多个显式尝试。

`autoResolveUniPtyBackend()` 对选中候选的 effect failure 直接 reject：

```ts
interface UniPtyBackendInitializationError extends Error {
  readonly code: "backend-initialization";
  readonly packageName: string;
  readonly stage: "import" | "factory-export" | "factory-call" | "ready";
  readonly inspection: BackendInspectReport;
  readonly cause: unknown;
}
```

成功路径仍只返回 ready Backend；初始化错误不是普通的 resolve/inspect report。

### Confirmed explicit bundle manifest

```ts
type BackendModule = object;

type UniPtyBackendManifestEntry = {
  packageName: string;
  metadata: UniPtyBackendMetadata;
  load(): Promise<BackendModule>;
};

type UniPtyBackendManifest = {
  entries: readonly UniPtyBackendManifestEntry[];
};

defineUniPtyBackendManifest({ entries });
autoResolveUniPtyBackend({ manifest, candidates });
```

`@unipty/helper-backend` 生成的模块与用户可手写的模块完全同构：

```ts
import { defineUniPtyBackendManifest } from "@unipty/backend";
import nodePtyMetadata from "@unipty/backend-node-pty/unipty.metadata";

export default defineUniPtyBackendManifest({
  entries: [
    {
      packageName: nodePtyMetadata.package.name,
      metadata: nodePtyMetadata,
      load: () => import("@unipty/backend-node-pty"),
    },
  ],
});
```

生成模块只公开 default export，值为已校验的 `UniPtyBackendManifest`。每个 Backend
的 `./unipty.metadata` 使用静态 default import；每个 `load()` 使用源码可见的字面量
dynamic import，但保持延迟执行。模块求值可以 import/校验 metadata，不得 import
Backend 主入口、调用 factory 或初始化 native。metadata 不内联为生成时 JSON/源码
快照，从而避免 helper 产物与实际安装版本漂移；也不使用字符串拼接 specifier、物理
包路径、`node_modules` 遍历或 runtime resolver。用户无需 helper runtime 即可手写
同一结构。

### Confirmed helper manifest generator

```bash
pnpm exec unipty-helper-backend manifest \
  --candidate @unipty/backend-node-pty \
  --candidate @unipty/backend-bun \
  --out src/generated/unipty-backend.manifest.ts
```

- bin 为 `unipty-helper-backend`，v1 子命令为 `manifest`；
- `--candidate` 至少一个、可重复并保留输入顺序；
- 必须且只能选择 `--out <file>` 或 `--stdout`；
- `--out` 默认拒绝覆盖，只有显式 `--force` 才允许替换现有文件；
- 源码只写 stdout 或目标文件，diagnostics 只写 stderr；
- CLI 的 `--from` 可选，缺省时以当前工作目录作为可信 project context；
- 不读取 `package.json` 推导候选、不扫描 `node_modules`、不联网安装、不 import
  Backend 主入口、不调用 factory、不初始化 native/FFI/external binary。

程序化入口为：

```ts
const source = await generateUniPtyBackendManifestModule({
  candidates: ["@unipty/backend-node-pty", "@unipty/backend-bun"],
  from: new URL(import.meta.url),
});
```

程序化 API 强制显式 `from: URL`，只解析并 import metadata、校验并返回源码，不写文件。
v1 不提供 helper 配置文件、自动候选发现、bundler plugin、native asset copier 或
`--check` contract。

提供 manifest 后，AutoResolve 不再扫描 `node_modules`、读取依赖树或调用 runtime
package resolver；它只在 manifest entries 上执行 metadata 选择、歧义判断与选中项
的 `load() -> factory -> ready`。Manifest 由构建流程生成，`load()` 必须是 bundler
可见的静态 loader；native addon、FFI、dylib 和外部 binary 的 materialization 与
externalization 不属于 manifest 或 UniPty Core。

`defineUniPtyBackendManifest()` 是 `@unipty/backend` 提供的规范构造/校验入口。它在
创建 manifest 时不调用任何 `load()`，并要求：

- `entries` 非空；
- 每个 metadata 通过同一套版本化 Metadata Protocol schema 校验；
- `packageName` 唯一，且与 `metadata.package.name` 完全相等；
- `metadata.backend.factoryExport` 非空；
- 每个 `load` 都是可调用函数；
- 返回的是不可变快照，不能通过后续修改输入数组改变候选集合。

由于 entry 含有可执行的静态 loader，生成产物应是 bundler-neutral 的 ESM 或
TypeScript，而不是只包含数据的 JSON。Manifest 生成由独立的
`@unipty/helper-backend` build/development helper package 负责；它不属于
`@unipty/backend-*` runtime Backend 命名空间，也不是 Core 的运行时依赖。Manifest
校验阶段不得预先调用 loader；只有候选选中后才允许执行 `load() -> factory -> ready`。

Runtime manifest 不包含 native-asset 路径、复制/下载/重定位规则或 bundler
externalization 指令。metadata 也不承载这些 build-time concern，不能在 bundle 后
推导出稳定的物理目录。跨 bundler 实测已经否决通用 asset schema；v1 不存在
public 或 helper-internal asset report，不新增 `./unipty.build`，也不提供通用
copy/downloader。每个 Backend package 与宿主部署负责自身 native materialization。

这个子路径对 bundler 的价值是：静态的
`import("@unipty/backend-node-pty/unipty.metadata")` 是明确的 alias/onResolve
拦截点，应用可以将其替换成构建期生成的 manifest 或自定义返回值。但任意字符串
拼接的动态 import 仍不保证会被 bundler 收集；bundle 场景最终仍需要静态候选清单
或 generated registry。该协议不会替代构建工具自己的 plugin API。

当前未发现社区已经统一采用 `./unipty.metadata` 这一名称。被广泛标准化的是
`package.json` 的 `exports` 子路径与条件导出机制；有些包会显式导出
`./package.json`，但它只能提供 manifest，不能表达 UniPty 的 Backend factory、
runtime compatibility 或 native asset/bundle contract。因此 UniPty 可以把这个
命名作为自己的领域标准，但不应宣称它是 npm 通用标准。

### Confirmed package-local `imports` implementation convention

官方 Backend 可以在自身 `package.json` 内声明私有映射：

```json
{
  "imports": {
    "#package.json": "./package.json",
    "#index": "./dist/index.js"
  }
}
```

`unipty.metadata` 只静态使用 package identity：

```ts
import packageJson from "#package.json" with { type: "json" };

export default {
  schema: 1,
  package: { name: packageJson.name, version: packageJson.version },
  backend: { id: "example", factoryExport: "createExampleBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node" }],
};
```

这比从文件系统反推包目录更符合模块解析器的语义：`#package.json` 可读取包自身
manifest。`#index` 只允许供未 bundle 的 package implementation 自检；metadata
模块求值不得执行 `import.meta.resolve("#index")`，因为 bundler 可能保留表达式却把
模块移出原 package scope。所有映射细节都留在包自己的 `imports` 中。Node 官方将
`imports` 定义为仅对包内 specifier 生效的 private mapping；Bun 也支持同类映射。
参考：[Node package imports](https://nodejs.org/api/packages.html#subpath-imports)、
[Bun module resolution](https://bun.com/docs/runtime/module-resolution)。

边界如下：

- `imports` 不是对外发现机制，消费者仍然只能通过 `exports` 暴露的
  `./unipty.metadata` 访问结果；
- Deno 的 `deno.json#imports` 是项目级 Import Map，不应与 npm 包的
  `package.json#imports` 直接视为同一机制。Deno 2.9.5 在 manual node_modules 模式下
  已通过 npm package 的 `#package.json` 静态导入与 `#index` 未 bundle 自检；
  参考：[Deno import maps](https://docs.deno.com/runtime/fundamentals/modules/import_maps/)、
  [Deno npm packages](https://docs.deno.com/runtime/fundamentals/node/#using-npm-packages)。
- metadata 应输出规范化字段，不能把完整 `package.json` 作为公共协议，避免将 npm
  私有字段、脚本或依赖树泄漏到运行时 API。

## Implementation acceptance

- resolved URL、diagnostics 与 runtime/conditions 的报告字段已经固定为实现细节：
  resolve report 只保留 package URL、optional metadata URL 与结构化 diagnostics，
  不宣称 loadability；inspection report 额外保留 metadata、protocol compatibility 与
  target diagnostics。
- 2026-08-19 的可重复 fixture 已验证 Node 24.19.0、Bun 1.3.14、Deno 2.9.5 的
  `./unipty.metadata`、静态 `#package.json`、未 bundle `#index` 与 metadata/main-entry
  effect separation；Bun/Deno code-splitting bundle 也保持 deferred loader。这个结果
  不证明 native addon、FFI、dylib 或 external binary 的 externalization。
- Native asset 责任边界已经由真实 Bun/esbuild/Deno 探针固定：manifest/helper 不携带
  asset 信息，各 Backend package 与宿主部署自行 materialize。Deno 官方 Backend 的
  npm build 必须 vendor `@sigma/pty-ffi/noinit` closure 与目标动态库，发布 runtime 不得
  残留 `jsr:` import，并以 packed npm artifact 在 Deno 下验收。
