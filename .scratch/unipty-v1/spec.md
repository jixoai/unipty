# UniPty v1: Runtime-neutral PTY and replaceable Backends

Status: ready-for-agent
Updated: 2026-08-19 Asia/Shanghai

> Original request (2026-08-17 Asia/Shanghai): learn from Termless and the
> related needs in OpenSpecUI and OpenTray Create, then define a runtime-neutral
> PTY abstraction for Deno, Node, and Bun with developer-selectable Backends.
> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): the PTY problem and
> scope; public PTY data/lifecycle semantics; the Backend seam; Backend
> acquisition and bundling; conformance and evidence. This is a living synthesis
> of confirmed decisions; unresolved research is not treated as fact.

## Problem Statement

开发者在 Node、Bun、Deno 以及不同操作系统中使用 PTY 时，需要面对不一致的启动、输入输出、尺寸调整、退出和终止语义。具体 PTY 技术还具有不同的安装方式、原生依赖、运行时限制和能力边界，导致消费项目重复编写探测、适配与降级代码。

用户需要的是一个聚焦 PTY 痛点的公共契约：应用可以显式选择具体 Backend，也可以提供自己的 Backend，而无需把某一运行时或原生实现提升为事实标准。命令文本解析、远程执行和持久会话可以围绕同一生态生长，但不能污染核心 PTY 承诺。

## Solution

UniPty v1 提供与运行时无关的 PTY 公共契约和可替换的 PtyBackend 扩展点。开发者显式选择 Backend；核心不隐式探测并切换到另一套语义。

```text
structured request ------------------------------+
                                                  |
command text -> optional Shell Parser             v
                 | direct request ----------> UniPty -> selected Backend -> PTY
                 |
                 +-> Shell Script Request
                       |
                       +-> caller explicitly accepts the named shell semantics
                           and constructs a structured request
```

本地原生实现、运行时原生实现，以及包装 tmux、Herdr、WezTerm、SSH 或 Docker 的 backend-wrapper，都通过同一个 PtyBackend 机制接入。持久化、重连和远程能力可以由特定 Backend 提供，但不是 UniPty v1 的共同保证，也不需要另一套插件生命周期。

官方生态可以提供 Shell Parser 包，降低用户从命令文本进入结构化启动请求的成本。解析器只分析文本；遇到管道、重定向、变量展开、命令替换等无法安全降维为参数数组的语义时，返回显式 Shell Script Request，由调用方决定是否以及如何执行。

## User Stories

1. As a cross-runtime library author, I want one PTY contract across Node, Bun, and Deno, so that my application logic does not depend on runtime-specific APIs.
2. As an application developer, I want to select a Backend explicitly, so that deployment constraints do not cause silent behavioural changes.
3. As an application developer, I want PTY startup to use a structured executable and argument request, so that command interpretation is deterministic.
4. As an application developer, I want working directory and environment to be explicit launch inputs, so that process context is portable and testable.
5. As a terminal UI developer, I want to send input and receive output through one public contract, so that rendering code is independent of the native binding.
6. As a terminal UI developer, I want to resize an active PTY, so that terminal geometry follows the user interface.
7. As a process supervisor, I want observable exit and termination behaviour, so that I can settle application state without backend-specific listeners.
8. As a Backend author, I want a stable PtyBackend contract, so that I can integrate a runtime or native PTY technology without modifying the core.
9. As a Backend author, I want unsupported behaviour to be explicit, so that callers do not mistake emulation or fallback for native support.
10. As an ecosystem author, I want to wrap another Backend or terminal host, so that composition does not require a second plugin mechanism.
11. As a tmux, Herdr, or WezTerm integrator, I want to expose its PTY-facing behaviour through a backend-wrapper, so that users can opt into its additional lifecycle features.
12. As an SSH or Docker integrator, I want to expose remote or container PTY behaviour through a backend-wrapper, so that UniPty consumers can retain the same top-level interaction model.
13. As a core consumer, I want persistence and reconnection to remain optional Backend behaviour, so that basic local PTY use stays small and honest.
14. As a user accepting command text, I want an optional parser with a consistent top-level result, so that I do not need to invent unsafe tokenization.
15. As a security-conscious developer, I want shell-requiring input to be identified explicitly, so that a parser cannot silently turn data into code execution.
16. As a PowerShell consumer, I want a parser that understands PowerShell semantics, so that POSIX assumptions are not applied to Windows command text.
17. As a POSIX shell consumer, I want a parser that distinguishes a direct invocation from shell language constructs, so that simple commands can avoid shell evaluation.
18. As a parser consumer, I want an incomplete or unsupported command to produce a typed failure, so that partial input is never executed accidentally.
19. As a maintainer, I want mature ecosystem parsers evaluated before building new ones, so that the project does not inherit unnecessary grammar maintenance.
20. As a maintainer, I want one public contract conformance suite, so that every official and third-party implementation is judged by observable behaviour.
21. As a consumer comparing Backends, I want verified support information, so that marketing labels do not substitute for runtime and platform evidence.
22. As a contributor, I want AI-generated historical claims separated from verified research, so that architecture decisions remain traceable to trustworthy evidence.
23. As a first-phase adopter, I want Node, Bun, and Deno Backend routes delivered together, so that runtime neutrality is a shipped property rather than a future promise.
24. As a Node developer, I want the Node route identified as `node-pty`, so that UniPty does not misrepresent a third-party implementation as an official Node runtime API.

## Implementation Decisions

- UniPty v1 is limited to the PTY abstraction and its Backend extension mechanism.
- The public contract is runtime-neutral; it is not defined as an alias of the Node PTY ecosystem or any other candidate implementation.
- Applications choose their Backend explicitly. Missing or incompatible Backends do not trigger an invisible fallback to pipes or another PTY implementation.
- PtyBackend is the only plugin mechanism required by the core. A backend-wrapper is itself a Backend that delegates to another terminal system, execution environment, or Backend.
- A PtyBackend supplies a Core-private Backend Endpoint rather than constructing or returning the public `Pty`. UniPty Core is the sole owner of the public stream, bootstrap buffering, representation conversion, backpressure, common errors, and lifecycle state machine.
- The Endpoint exposes one ordered private output source, `ReadableStream<NativeChunk>`, and one repeatably awaitable process observation, `readonly exited: Promise<BackendExitResult>`. `BackendExitResult` has the minimal common shape `{ exitCode: number | null; signal: string | null }`; `signal` describes the observed termination cause and is not a common signal-control vocabulary. Core alone reads the output source and may await the exit result from multiple public observers. `NativeChunk` is a tagged native representation (`bytes`, `text`, or both for the same ordered fragment); the representation is never inferred from a JavaScript runtime type, and text re-encoded by Core never becomes native bytes. Public stream cancellation only detaches the public view; Core keeps consuming or discarding the private source until explicit PTY teardown, while an established exit observation remains valid independently.
- The Endpoint input surface is synchronous `write(input: NativeInput): boolean` plus `drain(): Promise<void>`, not a second WritableStream protocol. `NativeInput` explicitly selects native `bytes` or native `text`; Core chooses that representation from the public `string | Uint8Array` input and the Backend's declared or operational acceptance, while a Backend-owned `writeDecode` policy may consume byte input on a text-native Endpoint. Endpoint `false` and typed saturation failures preserve the public Write Readiness and Advisory Backpressure semantics.
- The Endpoint resize surface mirrors the public operation as synchronous `resize(cols: number, rows: number): void`. Core validates finite positive Character-Cell Size values once; the Backend executes the request or reports an explicit unsupported failure, and no second geometry object or pixel-dimension protocol is introduced.
- The Endpoint lifecycle surface is synchronous `close(): void` plus `terminate(): void`. Both operations are idempotent and non-cascading: Endpoint `close()` releases PTY transport without requesting child termination, while Endpoint `terminate()` requests child termination without closing PTY transport. Core publishes the public `closed` state before invoking Endpoint `close()` and retains the independent `exited` observation.
- The configured `UniPty` instance exposes graceful Backend-level disposal as `dispose(): Promise<void>`. The first call publishes a no-new-spawn state synchronously, rejects later `spawn()` calls with the common closed-resource failure, and returns one stable disposal Promise reused by later calls. Existing PTYs are neither closed nor terminated; disposal waits for each to close through its own lifecycle, then invokes the ready Backend's `dispose(): Promise<void>` exactly once and resolves. It rejects only when Backend resource release itself fails.
- Core accepts a structurally ready Backend with synchronous `spawn(launch: StructuredLaunch): BackendEndpoint` and asynchronous `dispose(): Promise<void>`. Core construction accepts the ready object itself, never a Backend name, string identifier, registry entry, or factory. Official packages standardize on `await createXxxBackend(options)`; third-party packages may use other acquisition APIs, but Core never calls or awaits them. A ready Backend's `spawn()` may synchronously fail with a typed launch error, while transport, stream, and process observations begin after the Endpoint is returned. Backend `dispose()` is the shared-resource release hook invoked by `UniPty.dispose()` only after all Core-owned PTYs close.
- `UniPty<TBackend extends ReadyPtyBackend>` is a configured Core instance constructed with a ready Backend and Core options. The constructor infers and preserves the concrete Backend type, exposing the same instance through `readonly unipty.backend: TBackend`; it is not replaced by an untyped wrapper. Official Backend packages use an async `createXxxBackend(options): Promise<XxxBackend>` factory as their primary acquisition convention before passing the ready result to Core. Once ready, `unipty.spawn(structuredLaunch)` is synchronous and returns a public `Pty` after Core creates its private Backend Endpoint.
- The first phase must implement and release Node, Bun, and Deno Backend routes together. All three routes belong in documentation, CI contract coverage, and release acceptance. A runtime/platform tuple is advertised as verified support only after passing the public contract suite; this evidence gate constrains the claim, not whether the runtime route is implemented in the first phase.
- Concrete Backend packages use the uniform `@unipty/backend-*` namespace. The first-phase packages are `@unipty/backend-bun`, `@unipty/backend-node-pty`, and `@unipty/backend-deno-sigma__pty-ffi`; package names preserve the substrate provenance rather than reducing the last route to the runtime name Deno.
- The Bun route is based on the runtime-native `Bun.Terminal`, the Node route on third-party `node-pty`, and the last route on third-party `@sigma/pty-ffi` over Rust `portable-pty`. Deno is runtime metadata for `@unipty/backend-deno-sigma__pty-ffi`, not its complete implementation identity. Package ownership, substrate provenance, and runtime ownership remain separate claims.
- `@unipty/backend-deno-sigma__pty-ffi` is published as an npm package, not as a JSR-only or dual-registry package. Its pnpm build vendors the JavaScript dependency closure needed from `@sigma/pty-ffi/noinit` and includes the targeted native libraries in the npm tarball. Published runtime modules must contain no unresolved `jsr:` specifiers. The Backend factory owns exact runtime/OS/architecture library selection and explicit `noinit` initialization from package-owned assets; Core, metadata, resolver, Bundle Manifest, and helper neither locate nor materialize them. The standard packaged deployment keeps this Backend package external and resolvable so its assets remain adjacent; another host-bundling layout requires Backend-specific instructions rather than a common asset protocol.
- A separate `@unipty/backend` convenience package is part of v1. It exposes `autoResolveUniPtyBackend(options)` which returns a ready Backend for the existing `new UniPty({ backend })` boundary. This is a convenience layer, not Core fallback or a second plugin registry. Its algorithm is runtime-first: analyze the current runtime before candidate resolution; resolve an optional `candidates: string[]` preference list first; if configured candidates are unavailable, emit a structured warning through the configured sink and derive `fallbackCandidates` from the consumer's `package.json` dependency information; with no candidates, enter the fallback stage directly. Candidate selection is deterministic: explicit candidates are ordered preference, while fallback candidates require a unique compatible result and report `ambiguous` when multiple compatible results exist. Bundled callers use the explicit manifest path below.
- `@unipty/backend` exposes three separate acquisition stages. `resolveUniPtyBackend(packageName, { from })` is the pure single-package resolver: it requires an explicit `from: URL`, resolves exactly one package and its public metadata subpath, and reports locations plus resolution diagnostics without importing either module. `inspectUniPtyBackend(resolution)` accepts only a successful `BackendResolvedReport`, imports only its `./unipty.metadata` when present, validates the versioned schema, and reports target/protocol compatibility without loading or initializing the Backend factory. It never repeats package resolution or conflates an unresolved package with missing metadata. `autoResolveUniPtyBackend()` loops ordered candidates and fallbackCandidates through resolve then inspect, accepts an optional `from` for convenience, and otherwise uses a runtime-specific project context only when it can establish one without treating `@unipty/backend`'s own module location as the caller. Bundled, Deno import-map, and embedded-library callers must pass `from` explicitly. Only the selected package then proceeds through dynamic import, the declared factory export, and async readiness. Manual `await import()` plus factory invocation remains a supported direct acquisition path.
- Candidate fallback ends before effectful Backend initialization. Resolution or metadata-inspection failure may continue to the next candidate; once one candidate is selected, package import failure, factory lookup/call failure, or readiness failure is terminal and does not silently try another candidate. Initialization failure rejects with the selected candidate and structured cause; callers that want failover must explicitly orchestrate it.
- `autoResolveUniPtyBackend()` rejects selected-candidate effect failures with a structured `backend-initialization` error. The error preserves `packageName`, a stage of `import | factory-export | factory-call | ready`, the preceding `BackendInspectReport`, and the original `cause`; successful autoResolve still returns only a ready Backend.
- Bundled deployments may pass an explicit build-time `UniPtyBackendManifest` to `autoResolveUniPtyBackend({ manifest })`. A manifest contains static candidate entries with normalized metadata and bundler-visible `load()` functions. When present, AutoResolve does not scan `node_modules`, inspect dependency trees, or invoke runtime package resolution; it applies the same metadata selection, ambiguity, and selected-candidate readiness rules to the manifest entries. Native addons, FFI libraries, dylibs, and external binaries remain the Backend package/build contract.
- `defineUniPtyBackendManifest(input)` in `@unipty/backend` is the canonical manifest constructor and validator. It creates an immutable manifest snapshot without invoking any entry loader. Validation requires a non-empty `entries` list; metadata that passes the same versioned metadata-schema validator; unique `packageName` values; `packageName === metadata.package.name`; a non-empty `metadata.backend.factoryExport`; and a callable `load` for every entry. The returned manifest is safe to hand to `autoResolveUniPtyBackend()` without later mutation of the candidate list. Manifest generation belongs to the separate `@unipty/helper-backend` build/development helper package, while generated output remains bundler-neutral ESM or TypeScript because each entry contains executable `load()` behaviour, not JSON-only data. `@unipty/helper-backend` is not a runtime Backend implementation and is outside the `@unipty/backend-*` namespace.
- A generated Backend manifest is an ordinary hand-authorable ESM/TypeScript module with exactly one public export: the default-exported validated `UniPtyBackendManifest`. It statically default-imports each candidate's `./unipty.metadata`, calls `defineUniPtyBackendManifest()` during module evaluation, and gives each entry a literal-specifier deferred loader such as `load: () => import("@unipty/backend-node-pty")`. Module evaluation may load and validate metadata but must not execute a Backend loader, import a Backend entry module, call a factory, or initialize native resources. Metadata is imported from the installed Backend package rather than copied into generated JSON or source, preventing helper-owned version snapshots from drifting from the selected package. The generated module uses no string-built specifiers, physical package paths, `node_modules` traversal, or runtime resolver calls, and users may handwrite the same structure without helper-specific runtime support.
- `@unipty/helper-backend` publishes the `unipty-helper-backend` executable. Its v1 generation command is `unipty-helper-backend manifest`. One or more repeatable `--candidate <packageName>` arguments are required and preserve declaration order. Exactly one output mode is required: `--out <file>` writes the generated module, while `--stdout` writes only generated source to standard output; the two modes are mutually exclusive. File output refuses to replace an existing file unless `--force` is explicit. Diagnostics go to standard error and never contaminate generated standard output. `--from` optionally supplies the package-resolution base; when omitted by the CLI only, the current working directory is the trusted project context. The CLI never derives candidates from `package.json`, scans `node_modules`, installs packages, imports Backend entry modules, calls factories, or initializes native/FFI/external binaries.
- The helper package also exports the pure-source programmatic entry `generateUniPtyBackendManifestModule({ candidates, from }): Promise<string>`. `candidates` is non-empty and ordered; `from: URL` is required for the programmatic API. The function resolves and imports only candidate metadata, validates it, and returns generated source without writing files or initializing a Backend. V1 includes no helper configuration file, automatic candidate discovery, bundler plugin, native-asset copier, or `--check` contract; those require separate decisions.
- Runtime `UniPtyBackendManifest` deliberately excludes native-asset paths, copy instructions, download instructions, relocation rules, and bundler externalization directives. V1 has no public or helper-internal asset report, no `./unipty.build` protocol, and no generic asset copier or downloader. Native addon, FFI, dylib, and external-binary materialization remains owned by each Backend package, its release/build configuration, and the host deployment. `@unipty/helper-backend` generates only the explicit Backend manifest.
- Official Backend packages must export a side-effect-free `./unipty.metadata` subpath through `package.json.exports`. Its sole required public value is the default-exported `UniPtyBackendMetadata`; a named metadata export is not required. The subpath is the UniPty Backend Metadata Protocol and build hook, not a general npm discovery standard. Pure `resolveUniPtyBackend()` may resolve that subpath without importing it; any metadata import belongs to an explicit effectful inspect/selection stage. Metadata must be versioned and static, must not initialize native code or connections, and must not promise a stable physical package directory after bundling. Bundlers may alias a statically imported metadata subpath to a generated manifest, while dynamic arbitrary candidate imports still require a build-time registry or explicit external list. Third-party packages may omit the subpath; they remain resolvable, but autoResolve may instantiate them only through an explicit manifest entry. Manual `await import()` plus factory remains the deterministic path.
- Official package implementations may statically import normalized package identity through a package-local `package.json#imports` alias such as `#package.json`, or use equivalent build-time normalization. The private alias is not a consumer-facing discovery API. Metadata module evaluation must not execute `import.meta.resolve("#index")` or another package-scoped resolver: bundling can move the module outside its original package scope while preserving the expression. An optional `#index` alias remains an unbundled package-internal observation only and never becomes metadata, a build hook, or a metadata evaluation dependency. The 2026-08-19 Node 24.19.0, Bun 1.3.14, and Deno 2.9.5 probe established static `#package.json` compatibility; Bun and Deno code-splitting bundles preserved static metadata evaluation and deferred Backend loading.
- Official Backend metadata uses a versioned minimum schema containing normalized package identity (`package.name`, `package.version`), Backend identity (`backend.id`), a required factory export name (`backend.factoryExport`), required Core protocol compatibility (`protocol.core`), and target declarations used only for side-effect-free runtime/platform prefiltering. Provenance (`kind`, `substrate`) is optional display context. `protocol.core` is a non-empty unique list of positive integer Core protocol majors; v1 Backends declare `[1]`. It is independent from the metadata `schema` version and from npm package versions. `inspectUniPtyBackend()` reports `incompatible` when the active Core protocol major is absent or targets explicitly exclude it. `backend.factoryExport` remains mandatory so autoResolve never guesses an entry export; metadata remains declarative and does not prove module loadability or Backend readiness.
- Backend governance, evidence, and acquisition are separate layers. Official identity is a repository/catalog and release-pipeline fact, never established by a self-reported metadata field. The `@unipty/backend-*` namespace is reserved for official concrete Backend packages; community Backends may use any package name and become protocol-compatible by exposing the public metadata/factory contract. Metadata provenance describes implementation kind and substrate only; it carries no authoritative `official` or `community` credential.
- Metadata deliberately contains no maturity label, verification claim, capability list, asset strategy, asset path, or official/community credential. These are either runtime-operation facts or release/build concerns, and would duplicate or contradict the repository-owned compatibility catalog. AutoResolve never sorts or prefers candidates by namespace, official identity, provenance, or catalog evidence; explicit candidate order and the existing unique-fallback rule remain the only selection authority.
- The repository-owned Official Catalog is the only source for a `verified` support claim. Each release catalog snapshots validated public metadata for its official Backend package versions and contains only Verification Evidence emitted after the full public contract suite passes. Membership denotes official release ownership; v1 adds no separate `official` boolean or maturity taxonomy. The catalog schema version is independent from Backend metadata schema, Core protocol, package semver, and conformance-suite version.
- One Verification Evidence record identifies the exact Backend package name/version and Backend id, Core package version and protocol major, runtime name/version, normalized OS/arch/libc tuple, conformance-suite identity/version, tested repository commit, ISO-8601 verification time, and optional stable report reference. Linux native tuples require an explicit `libc`; other hosts omit it unless it changes native compatibility. The unique evidence key is the complete package, runtime, platform, suite, and commit identity; the catalog aggregator rejects duplicate or contradictory records.
- Verification Evidence is positive and version-exact. A failed, skipped, cancelled, or missing job emits no evidence and cannot create a permanent `unsupported` claim. Documentation derives only three presentation states: `verified` when exact evidence exists for the released Backend version and tuple, `declared-unverified` when the metadata target matches but evidence is absent, and `not-targeted` when the release metadata target excludes the tuple. It never widens an exact runtime version into a range, and evidence does not expire merely because time passes; a new Backend package version requires new evidence.
- Conformance CI runs each Backend through its installed public package surface and emits one machine-readable evidence artifact only after the complete suite passes. A deterministic aggregation job validates record schema, package/metadata identity, suite version, tested commit, tuple normalization, uniqueness, and the release workflow's required route coverage; it then emits one catalog JSON artifact with stable ordering. First-phase release coverage requires at least one native passing tuple for each of `@unipty/backend-node-pty`, `@unipty/backend-bun`, and `@unipty/backend-deno-sigma__pty-ffi`; only the exact passing tuples become `verified`.
- The release pipeline attaches the aggregated catalog to the same tagged release as the package versions it describes. `packages/www` receives an explicit release/tag catalog artifact, validates it, and copies it unchanged into the static site; it neither imports native Backend entries nor recomputes evidence. Site deployment remains independently retryable and does not block package publication after the release gate passes. The catalog is evidence for humans and documentation only: Core, resolver, AutoResolve, Backend selection, and runtime operation never fetch or consume it.
- `packages/www` is the private workspace for the static official site and deploys through GitHub Pages. The Owner manages the `unipty.jixoai.com` CNAME mapping. Its visual direction follows the official website in the sibling `../openspecui` project as it exists when implementation begins; this is a reference, not a source dependency. V1 architecture does not preselect the site framework or reproduce OpenSpecUI implementation details. The website implementer must inspect that project and choose the concrete GitHub Pages build/deployment setup during implementation without reopening Core or Backend contracts.
- Target identifiers use the normalized Node/npm vocabulary: `os` follows `process.platform`/npm `os` tokens, `arch` follows `process.arch`/npm `cpu` tokens, and `libc` is a separate native-library dimension such as `glibc` or `musl`; packages must not invent combined strings such as `macos-arm64`.
- Backend-level access and per-PTY capability access remain distinct: `unipty.backend` exposes the concrete shared Backend instance with its inferred type, while `pty.capability(token)` retrieves one Endpoint-derived capability object without widening the common `Pty` API.
- One `UniPty` instance owns one ready Backend and may synchronously create multiple PTYs through it. Sharing one Backend instance across multiple `UniPty` instances is not a v1 guarantee; Backend lifecycle and Core-option ownership remain local to the configured Core instance.
- Options are owned by their narrowest stable scope: the `UniPty` constructor accepts the required ready Backend and Core-wide policy only; `spawn()` owns structured launch inputs and initial character-cell size; `pty.stream()` owns output representation selection; Backend factories/readiness own native loading, connection, authentication, queue tuning, persistence, and remote-host configuration. These scopes are not flattened into one universal options bag.
- Persistent sessions, detachment, reattachment, restoration, and remote lifecycle management may be Backend-specific extensions but are not v1 guarantees.
- Core launch input is structured: executable, arguments, working directory, and environment are supplied explicitly.
- The public spawn shape is Bun-style `unipty.spawn(argv, options)`, where `argv` is a non-empty structured argument vector: its first element is the executable and remaining elements are arguments. The core provides no string-command overload and never interprets `argv` through a shell.
- Initial PTY geometry belongs to the nested spawn option `terminal: { cols, rows }` and uses Character-Cell Size semantics. The public shape does not flatten `cols` and `rows` into the top-level spawn options.
- When `spawn` omits a terminal dimension, Core resolves each dimension independently in this order: explicit `terminal` value, valid positive decimal `COLUMNS`/`LINES` value from the Core host environment, current host TTY size when the runtime exposes a trustworthy probe, then the portable default `80 × 24`. `spawn(..., { env })` describes the child process environment and does not silently override Core's geometry resolution; callers that need a per-launch size use the explicit `terminal` option. Missing or invalid input for one dimension does not invalidate a valid value for the other; an explicitly supplied invalid `terminal` value still fails with `invalid-argument`.
- The PTY data plane is representation-aware. A Backend may expose native Terminal Bytes, native Terminal Text, or both; availability and fidelity are separate claims.
- The official text-oriented upper layer prefers a Backend's native Terminal Text. Only when native text is absent does it incrementally decode Terminal Bytes, and conversion occurs on demand rather than on every data path.
- Automatic representation conversion is asymmetric: Terminal Bytes may become derived Terminal Text, but native Terminal Text is never re-encoded and exposed as raw Terminal Bytes. A text-only Backend reports raw-byte output as unavailable; callers may explicitly encode text when derived bytes are sufficient.
- The main UniPty package exposes the explicit output selector `pty.stream({ encoding: "utf8" | "bytes" })` as a Web `ReadableStream`. `utf8` returns `ReadableStream<string>` using the native-text-first rule; `bytes` returns `ReadableStream<Uint8Array>` or fails explicitly when native Terminal Bytes are unavailable. Native Buffer chunks may pass through as Uint8Array values, but Buffer is not the public type.
- Cancelling a Terminal Stream, including the default cancellation caused by leaving `for await...of` early, performs Terminal Stream Detachment only. It ends that output view without closing PTY input, closing the PTY transport, or terminating the child process; explicit lifecycle operations remain the sole authority for those effects.
- Before the first Terminal Stream exists, UniPty retains startup output in a bounded Bootstrap Output Buffer using the Backend's native representation. A full bootstrap buffer applies PTY output backpressure rather than truncating data. After the last established view detaches, UniPty instead keeps the PTY transport drained and discards output while no consumer exists; a later view starts with future output and receives no core replay. Backend retention and replay remain explicit extensions.
- UniPty permits one active Terminal Stream per PTY. A second `pty.stream(...)` call while that view is active fails explicitly; after detachment, a future-only view may be created. Consumers needing fan-out call the standard `stream.tee()` themselves and own its branch backpressure, cancellation, mutable-chunk aliasing, and copy policy; UniPty does not add a second multicast layer.
- The resize baseline is `pty.resize(cols, rows): void` with character-cell dimensions only. UniPty validates finite positive integers; pixel dimensions and platform-specific terminal controls are outside the common API. A normal return means the resize request was accepted, not that the child observed it; a Backend that cannot support the request must fail explicitly.
- Terminal Stream completion observes Terminal transport EOF (or reports a transport read error), while Process Exit Result independently observes child-process completion as `{ exitCode: number | null; signal: string | null }`. EOF does not synthesize an exit result, process exit does not force a clean stream completion, and cancelling a stream does not cancel process-exit observation.
- `close(): void` is an idempotent logical resource and PTY-transport close operation. It publishes the `closed` state before returning, so later `write()`, `resize()`, and new `stream()` creation fail with the common `closed` code. Active-stream completion, physical transport release, and the retained exit watcher may finish asynchronously; `close()` does not promise child-process termination.
- `terminate()` is an idempotent, synchronous termination request. A normal return means the Backend accepted the request; it does not mean that the child has exited and does not wait for the independent Process Exit Result. Repeated termination requests do not create additional required effects.
- `terminate()` and `close()` are non-cascading lifecycle operations: termination does not implicitly close the PTY transport, and close does not implicitly request child termination. A caller that needs both effects must invoke both operations explicitly and choose the order.
- Closing the PTY transport does not cancel an already-established Process Exit Result observation. A child that remains alive after `close()` may still settle that observation later; this does not keep the closed Terminal Stream or PTY I/O surface usable.
- An active Terminal Stream completes normally when the caller explicitly closes the PTY transport. This intentional close is distinct from a transport read failure, which errors the stream; after close, new stream creation remains rejected.
- Signal-specific controls such as `kill(signal)` are not part of the UniPty v1 common API or the Endpoint minimum. A Backend may expose them through an explicit capability object with its own accepted signal vocabulary; the public `Pty` has no universal `kill()` method. Undeclared or unsupported signals must fail explicitly rather than being emulated silently, while the capability discovery mechanism and exact type shape remain Backend-extension concerns.
- Common operational failures use a stable discriminant `error.code`; cross-runtime `Error` class identity is not part of the contract. The v1 common codes are `unsupported`, `closed`, `backpressure`, `invalid-argument`, and `active-stream`. Backend-specific diagnostics may be carried in structured `details` and/or `cause`; callers must not depend on error message text.
- Capability access uses an opaque, type-safe token extension on public `Pty`: `capability<T>(token: CapabilityToken<T>): T | undefined`. A Backend package owns and exports one stable singleton token and its branded capability type; Core matches token identity by object identity, not by a global string registry or a forgeable name. Only the token from the same loaded Backend package instance is compatible: duplicate installed copies produce distinct tokens and lookup returns `undefined`, with no string-name fallback. Core treats the capability payload as opaque and does not define signal-specific methods. Token presence never replaces an operation result, an explicit `unsupported` failure, or the no-implicit-fallback rule.
- UniPty specifies observable lifecycle outcomes, not a Backend's internal teardown order. Backends own the physical release sequence for transport handles, decoders, listeners, and retained exit watchers, provided the public closed-state, stream-completion, and exit-observation guarantees hold.
- The main UniPty package accepts `pty.write(data: string | Uint8Array)`. When a Backend accepts the supplied representation natively, UniPty preserves it; string input may be UTF-8 encoded for a byte-native Backend, but the strict upper layer never silently decodes byte input for a text-only Backend.
- A text-only Backend may explicitly provide a Backend Write Decoder through `writeDecode?: true | TextDecoder`. An absent option remains strict, `true` creates a stateful default UTF-8 decoder, and an explicit `TextDecoder` preserves the caller-selected encoding, fatal, and BOM policy. Decoder state spans writes and is finally flushed when PTY input is finalized during teardown. This path is decoded text input, never native byte input.
- `pty.write(...)` returns Write Readiness as a synchronous boolean. A normal return means the entire supplied value was accepted for ordered delivery: `true` permits continued writing, while `false` means the value was still accepted but the caller should pause and wait for drain. The value never reports a partial write, byte count, PTY-transport flush, or child-process consumption.
- `pty.drain(): Promise<void>` is the Write Readiness wait. It resolves immediately when writing may continue, or after a `false` result when the input queue reaches its resume threshold; it rejects if input becomes unusable before readiness returns. It is not a physical PTY flush barrier and does not mean the child has consumed the data.
- Input uses Advisory Backpressure. A `false` result does not lock future calls: later writes may still be accepted while bounded input capacity remains. When an entire value cannot be admitted, `write()` throws a typed input backpressure failure synchronously and accepts none of that value. Partial acceptance, silent loss, and unbounded queue growth are forbidden.
- Numeric queue thresholds, capacities, and measurement units are not UniPty v1 public options. Every Backend owns a bounded Backend Queue Policy suited to its native representation and transport, and may expose Backend-specific tuning options. Only readiness, drain, and saturation behaviour are portable; concrete queue numbers are not.
- UniPty core does not parse arbitrary shell command strings or silently select the host's default shell.
- Shell Parser packages are optional official ecosystem packages, separate from the core and from Backend packages.
- A Shell Parser never executes a process. Its top-level result distinguishes a direct structured launch, an explicit Shell Script Request, and invalid, incomplete, or unsupported input.
- A Shell Script Request identifies its shell language and source. The caller must explicitly accept that interpretation and select the concrete shell execution policy before constructing the core launch request.
- Existing maintained parser libraries should be evaluated before implementing a parser. Wrapping is preferred when the dependency's contract and maintenance posture are sufficient; a fork requires a concrete compatibility, correctness, or maintenance reason.
- Candidate backend-wrapper families include tmux, Herdr, WezTerm, SSH, and Docker. Their package names, exact behaviours, and official status remain undecided until research establishes their usable PTY surfaces.
- The active spec is `ready-for-agent`: architecture choices are closed, while implementation probes and release evidence remain explicit acceptance work. Contradictory implementation findings revise this document in place and record the reason in Further Notes before supporting documents change.

### Public Contract Shapes

The following TypeScript-shaped declarations define the v1 public data contracts;
they describe values at the module interface rather than a required internal
implementation.

```ts
type UniPtyErrorCode =
  "unsupported" | "closed" | "backpressure" | "invalid-argument" | "active-stream";

interface UniPtyError extends Error {
  readonly code: UniPtyErrorCode;
  readonly details?: unknown;
}

type UniPtyBackendMetadata = {
  readonly schema: 1;
  readonly package: { readonly name: string; readonly version: string };
  readonly backend: { readonly id: string; readonly factoryExport: string };
  readonly protocol: { readonly core: readonly number[] };
  readonly targets: readonly {
    readonly runtime: "node" | "bun" | "deno";
    readonly os?: readonly string[];
    readonly arch?: readonly string[];
    readonly libc?: readonly string[];
  }[];
  readonly provenance?: {
    readonly kind: "runtime-native" | "third-party" | "external-system";
    readonly substrate: string;
  };
};

type BackendDiagnostic = {
  readonly code: string;
  readonly message?: string;
  readonly cause?: unknown;
};

type BackendResolvedReport = {
  readonly status: "resolved";
  readonly packageName: string;
  readonly packageUrl: string;
  readonly metadataUrl?: string;
  readonly diagnostics: readonly BackendDiagnostic[];
};

type BackendResolveReport =
  | BackendResolvedReport
  | {
      readonly status: "unresolved";
      readonly packageName: string;
      readonly reason: "missing" | "invalid";
      readonly diagnostics: readonly BackendDiagnostic[];
    };

type BackendInspectReport =
  | {
      readonly status: "compatible" | "incompatible";
      readonly resolution: BackendResolvedReport;
      readonly metadata: UniPtyBackendMetadata;
      readonly diagnostics: readonly BackendDiagnostic[];
    }
  | {
      readonly status: "metadata-missing" | "metadata-invalid";
      readonly resolution: BackendResolvedReport;
      readonly diagnostics: readonly BackendDiagnostic[];
    };

type UniPtyBackendWarning = {
  readonly code: "candidate-unavailable";
  readonly packageName: string;
  readonly stage: "resolve" | "inspect";
  readonly diagnostics: readonly BackendDiagnostic[];
  readonly cause?: unknown;
};

type BackendModule = object;

type UniPtyBackendManifestEntry = {
  readonly packageName: string;
  readonly metadata: UniPtyBackendMetadata;
  load(): Promise<BackendModule>;
};

interface UniPtyBackendInitializationError extends Error {
  readonly code: "backend-initialization";
  readonly packageName: string;
  readonly stage: "import" | "factory-export" | "factory-call" | "ready";
  readonly inspection: BackendInspectReport;
  readonly cause: unknown;
}
```

`BackendDiagnostic.code` is an open, structured diagnostic namespace because
native resolver failures differ by runtime; callers may branch only on the
stable report statuses and error codes above. A `resolved` report may omit
`metadataUrl`: that is the normal representation of a package that lacks the
optional metadata subpath, and it becomes `metadata-missing` at inspection.
`inspectUniPtyBackend()` accepts only `BackendResolvedReport`, so it cannot
mistake an unresolved package for missing metadata or run the resolver twice.
`BackendModule` intentionally exposes no guessed factory type; the declared
metadata export name is looked up and validated only in the selected,
effectful factory stage.

## Testing Decisions

- Resolver and inspection outcomes use discriminated reports. `BackendResolveReport` is `resolved` with `packageUrl` and optional `metadataUrl`, or `unresolved` with `reason: missing | invalid`; it never claims loadability. `BackendInspectReport` is `compatible | incompatible` with validated metadata, or `metadata-missing | metadata-invalid`; it never claims factory readiness. Each report carries the prior resolution report and structured diagnostics.
- `autoResolveUniPtyBackend()` accepts an optional structured `onWarning(warning)` sink. Without one it uses the host `console.warn`; with one, warning delivery is fully caller-owned. Pure `resolveUniPtyBackend()` and `inspectUniPtyBackend()` never write to a console or invoke a warning sink; they return structured diagnostics only. Warning records identify the candidate, stage, code, and cause without making message text part of the contract.

- The sole acceptance seam is the public package contract. Tests import packages through their public entry points and assert observable results, never adapter internals.
- First-phase release acceptance runs the same public contract suite against `@unipty/backend-node-pty`, `@unipty/backend-bun`, and `@unipty/backend-deno-sigma__pty-ffi`. Individual runtime/platform tuples remain unverified until that tuple passes; an unverified tuple must not be represented as supported merely because the runtime route is mandatory.
- Deno-route release acceptance packs `@unipty/backend-deno-sigma__pty-ffi`, installs the resulting npm artifact in an isolated consumer, rejects any published runtime `jsr:` import, verifies the selected package-owned dynamic library exists, and runs the public PTY contract under Deno with the required FFI permission. Workspace-source or direct-JSR success cannot substitute for this packed-package test.
- AutoResolve conformance verifies single-package `resolveUniPtyBackend(packageName)` behaviour, runtime-first ordering, explicit-candidate preference, terminal warning when configured candidates are unavailable, package.json-derived fallback candidates, and the distinction between pure resolve (no import/init side effects) and `autoResolveUniPtyBackend()` (selected import plus factory readiness).
- Backend metadata conformance verifies the public `./unipty.metadata` subpath and its default-exported `UniPtyBackendMetadata`, schema validation, required `backend.factoryExport`, normalized package identity, Core protocol compatibility, and target prefilter semantics. It rejects metadata claims for capabilities, native assets, maturity, verification, or official identity.
- Protocol-compatibility conformance verifies a non-empty unique positive-integer `protocol.core` declaration independently from metadata schema validation and package semver. Absence of the active Core protocol major produces `incompatible`; maturity, provenance, namespace, and official/community presentation labels never change that result or candidate priority.
- Evidence conformance requires exact package/Core/runtime/platform/suite/commit identity for every catalog `verified` tuple. Jobs emit evidence only after full success; failed, skipped, cancelled, partial, duplicate, contradictory, malformed, or wrong-commit records are rejected by aggregation and do not alter runtime selection.
- Catalog conformance validates the release metadata snapshot, stable record ordering, complete tuple normalization, exact-version presentation, and three-state derivation `verified | declared-unverified | not-targeted`. The site consumes one explicitly selected release artifact unchanged; it never converts absent evidence into support, failure into permanent unsupported status, or one runtime version's result into a range claim.
- First-phase release conformance requires at least one native passing tuple for every official runtime route before package publication. Additional declared tuples may remain `declared-unverified`; their absence does not weaken the mandatory Node/Bun/Deno implementation boundary or create an unsupported claim.
- Resolver-stage conformance verifies that `resolveUniPtyBackend()` performs no imports, `inspectUniPtyBackend()` imports metadata but does not initialize a Backend, and `autoResolveUniPtyBackend()` imports and readies only the selected candidate.
- Report conformance verifies the discriminants, nested resolution report, package/metadata URLs, structured diagnostics, and the prohibition on treating `resolved` or `compatible` as Backend readiness.
- Warning conformance verifies default `console.warn`, injected `onWarning` delivery, structured candidate/stage/code details, and the absence of output side effects in pure resolve and inspect stages.
- Candidate-selection conformance verifies ordered explicit preference, duplicate handling by first occurrence, unique fallback selection, and `ambiguous` failure for multiple compatible fallback candidates.
- Initialization conformance verifies that selected-candidate import, factory, and readiness failures terminate AutoResolve without attempting later candidates and preserve the selected package plus structured cause.
- Initialization-error conformance verifies rejection code, stage, selected package, preceding inspection report, and cause preservation.
- Manifest conformance verifies that `defineUniPtyBackendManifest()` rejects empty, duplicate, metadata-mismatched, schema-invalid, or non-callable entries; does not invoke loaders during construction; returns an immutable candidate snapshot; and that autoResolve uses manifest-only selection, invokes a static loader only for the selected entry, and preserves native-asset responsibility outside Core. Generated-module conformance requires one default manifest export, static default metadata imports, literal dynamic-import specifiers in deferred loaders, no embedded metadata snapshots, and no Backend import/factory/native initialization during module evaluation. A hand-written module with the same public shape must be accepted identically.
- Helper CLI conformance verifies required ordered `--candidate` arguments, mutually exclusive `--out`/`--stdout`, explicit `--force` before replacement, source-only stdout, diagnostics-only stderr, optional CLI `--from` with current-directory fallback, and the absence of dependency inference, filesystem discovery, installation, Backend entry import, factory calls, and native initialization. Programmatic conformance requires explicit `from: URL`, returns source without filesystem writes, and produces the same module contract as the CLI.
- Backend conformance always acquires the Backend Endpoint through a ready `UniPty` Core instance and tests the resulting public `Pty`; the private endpoint is not an alternative acceptance seam.
- Readiness conformance places one-time runtime, connection, and capability setup before Core construction. A Backend that is passed to Core as ready must expose synchronous per-PTY spawn; launch failure remains a synchronous typed operation failure, while later transport and process failures remain independent observations.
- Multi-spawn conformance creates multiple PTYs through one configured `UniPty` instance and verifies that each receives an independent public lifecycle; cross-Core Backend sharing is outside the common suite.
- Options-ownership conformance verifies that Core, launch, stream, and Backend-specific settings are accepted only at their owning boundaries and do not silently migrate between scopes.
- Spawn conformance accepts non-empty argv vectors, preserves executable/argument order, rejects an empty vector with `invalid-argument`, and verifies that shell metacharacters remain ordinary argv data.
- Spawn geometry conformance validates the nested `terminal` shape using the same finite positive integer Character-Cell Size rules as `resize()`.
- Default-geometry conformance covers explicit values, valid and invalid host-environment `COLUMNS`/`LINES`, TTY and non-TTY hosts, partial per-dimension fallback, and the final `80 × 24` fallback. Environment values are treated as user preference and therefore precede host TTY probing; child launch environment values do not participate unless copied into the host environment or supplied explicitly through `terminal`.
- The Backend conformance profile covers structured launch, input, output, resize, normal exit, requested termination, close, launch failure, and unsupported behaviour.
- Real Backend acceptance uses a deterministic child program inside a real PTY. Mocks may support narrow error injection but cannot establish native PTY compatibility.
- The same conformance scenarios run for each claimed runtime and operating-system combination. A combination is not documented as supported merely because it compiles or installs.
- Parser conformance covers direct invocations, quoting, empty arguments, incomplete input, unsupported syntax, and constructs that require an explicit shell request.
- POSIX-like and PowerShell parsers share the top-level result contract while retaining language-specific fixtures; one language's grammar is never used as the other's oracle.
- Neither byte nor text chunks are semantic message boundaries. Derived text must decode incrementally across byte chunk boundaries; conformance must cover native-text and derived-text paths separately.
- A text-only Backend must fail raw-byte capability checks explicitly; conformance rejects implementations that label text re-encoding as native Terminal Bytes.
- Static and runtime conformance must keep `pty.stream({ encoding: "utf8" })` text-only and `pty.stream({ encoding: "bytes" })` byte-only; `binary` is not a public encoding label.
- Both stream variants must support `for await...of`. Cancelling either stream variant, directly or by leaving iteration early, must detach only that view and leave PTY input, transport, and process lifetime unchanged.
- Stream-detachment conformance observes that a still-running process does not exit and its PTY remains operational after its output view is cancelled; it must not rely on Backend-internal listener state.
- Bootstrap-output conformance delays the first stream until after a startup marker is emitted and requires that marker in order. It also reaches the bounded bootstrap limit and verifies backpressure rather than silent truncation.
- Post-detachment conformance emits output with no consumer, verifies the child remains able to progress, and verifies that a later stream receives only output produced after its subscription.
- Active-stream conformance rejects a second concurrent `pty.stream(...)` call with a typed failure, permits a new stream after detachment, and verifies that standard `stream.tee()` remains available without treating its branches as UniPty-managed views.
- Resize conformance accepts valid positive integer cell sizes, rejects zero, negative, fractional, `NaN`, and infinite values, excludes pixel arguments from the common API, and verifies explicit failure for Backend-level unsupported requests.
- Lifecycle conformance observes transport EOF/read error and process exit separately, including non-zero exit and signal cases; it does not infer one observation from the other or from stream cancellation.
- Close conformance calls `close()` repeatedly, verifies synchronous `closed` publication and idempotency, rejects subsequent writes, resize requests, and stream creation with the common `closed` code, and verifies that close alone does not synthesize child-process termination.
- Termination conformance calls `terminate()` repeatedly, verifies synchronous request acceptance and idempotency, and observes the later Process Exit Result independently rather than treating the request as an exit wait.
- Lifecycle conformance verifies that `terminate()` alone does not implicitly close the transport and that `close()` alone does not request child termination; combined teardown is driven only by explicit caller operations.
- Close-lifecycle conformance closes a still-running PTY, verifies that existing Process Exit Result observation remains settleable, and separately verifies that closed PTY I/O surfaces remain unusable.
- UniPty-disposal conformance verifies that the first `dispose()` call synchronously blocks new spawns, repeated calls return the same Promise, live PTYs remain usable and are not implicitly closed or terminated, Backend `dispose()` is invoked exactly once only after every existing PTY closes, and the public Promise settles with that shared-resource release result.
- Stream-close conformance verifies that explicit `close()` completes the active Terminal Stream normally, while an independent transport read failure still errors the stream.
- Signal-capability conformance is Backend-specific: when a signal control is advertised, supported and unsupported signal values must be distinguishable through the public Backend surface; the common suite does not require a signal API.
- Error conformance asserts stable common `error.code` values for unsupported operations, closed resources, input saturation, invalid arguments, and concurrent active streams, while preserving Backend-specific diagnostics without requiring shared Error subclasses.
- Capability conformance covers opaque token lookup, rejects an equal-looking token from a duplicate package instance by returning `undefined`, and verifies that no string-name fallback occurs. Metadata remains advisory: token presence or descriptors never replace explicit operation results or `unsupported` failures.
- Input conformance covers native string and native byte paths without unnecessary conversion. A byte-native Backend must accept UTF-8-encoded string input; a strict text-only Backend must reject byte input unless its own Backend Write Decoder is enabled.
- Backend Write Decoder conformance splits one UTF-8 sequence across multiple writes, verifies final decoder flush, preserves a supplied decoder's fatal and BOM policy, and requires decoding failures to be observable.
- Write conformance requires `write()` to return only boolean Write Readiness. Both boolean outcomes accept the complete value exactly once and preserve input order; `false` must never instruct the caller to retry any portion.
- Drain conformance verifies immediate resolution while ready, resolution after readiness recovers, rejection after input failure, and the absence of any implied child-consumption or physical-flush guarantee.
- Backpressure conformance verifies that writes may continue after `false` while capacity remains, queue saturation produces a typed synchronous failure with zero acceptance of the rejected value, and no implementation silently drops input or grows an unbounded queue.
- Queue-policy conformance verifies the portable readiness, drain, and saturation outcomes through each Backend's public package surface without requiring equal thresholds, capacities, or measurement units.
- Adjacent OpenTray Create and OpenSpecUI terminal flows provide consumer scenarios and regression inspiration, but UniPty acceptance remains independent of their internal implementations.

## Out of Scope

- A core-managed persistent terminal session service.
- Core guarantees for detach, attach, snapshot, restore, or reconnection.
- A second plugin registry beside PtyBackend.
- Automatic selection of the machine's default shell.
- Implicit shell evaluation of a command string.
- Silent fallback from a selected PTY Backend to pipes or another Backend.
- Treating tmux, SSH, Docker, or other hosts as universally equivalent to a local PTY.
- Advertising an additional native PTY route without public-contract evidence.
- Compatibility or migration commitments for an earlier UniPty API; no such API exists yet.

## Further Notes

The initial `prototype.md` is a conversation transcript and therefore a source of hypotheses, not verified technical evidence. Existing parser-library claims still require primary-source research. Runtime and platform claims are recorded only at the versions and evidence levels established by the runtime matrix; unmeasured platform combinations remain unverified.

Termless research against official upstream commit `92a6e6b` established that its `Backend` is a VT emulator owning screen state, not a process-facing PTY Backend. Its optional PTY layer is a small Node/Bun adapter using direct argv and bidirectional terminal traffic. Persistence, resumption, and multiplexing are explicitly outside the Termless boundary. These facts reinforce the existing scope decision but do not by themselves decide UniPty's I/O representation or lifecycle result.

Runtime research on 2026-08-18 established that `node-pty` uses Unix PTYs and Windows ConPTY, while `@lydell/node-pty` is a prebuilt-only distribution of that implementation. Bun v1.3.13 introduced `Bun.Terminal` for Linux and macOS, and Bun v1.3.14 added Windows through ConPTY; the `@oven/bun-windows-*` packages distribute the Bun runtime rather than a separate Windows PTY implementation. Bun's built-in terminal separates terminal transport EOF from process exit status and documents non-byte-identical ConPTY output. Deno officially supports Node-API addons only with local `node_modules` and FFI permission, but the macOS arm64 `@lydell/node-pty` probe initialized without producing data or exit callbacks and therefore did not pass. `@sigma/pty-ffi` is a Deno-specific FFI wrapper over Rust `portable-pty`, not a cross-runtime package. On the same machine, version 0.42.0 passed structured launch, byte read, resize, and exit-code probes. These measurements do not establish Windows or Linux support; the three runtime routes are mandatory, while each runtime/platform support claim remains evidence-dependent.

Parser research on 2026-08-18 found `unbash` 4.0.10 to be a current pure-JavaScript Bash AST candidate with partial trees and source-positioned diagnostics; it is suitable for later thin-wrapper evaluation but is not yet selected. `sh-syntax` is a broader WASM parser/formatter candidate with a different async and recovery cost. Tree-sitter packages provide tolerant CSTs for editor analysis, not launch semantics. For PowerShell, the semantic authority is the official `Parser.ParseInput` API; no equivalent official npm parser was found under the checked package names. A PowerShell package therefore remains an optional adapter requiring an explicit `pwsh` or .NET host rather than a presumed pure-JavaScript parser. The stable UniPty boundary remains result classification, not a shared cross-language AST.

Deferred implementation evidence:

- Packed official Backend artifacts, native contract-matrix execution, release catalog attachment, and site consumption.
- Bash parser runtime compatibility and corpus coverage, plus PowerShell adapter host/version policy; these optional ecosystem packages do not block Core/Backend v1 implementation.

Decision history:

- 2026-08-17: The destination was fixed as a buildable v1 architecture specification, not implementation.
- 2026-08-17: v1 was limited to PTY; persistent and reconnectable sessions moved to optional Backends.
- 2026-08-17: backend-wrapper packages were accepted as ordinary PtyBackend implementations rather than a second plugin system.
- 2026-08-18: PtyBackend was fixed to supply a Core-private Backend Endpoint; only Core constructs the public `Pty` and owns its common state machine.
- 2026-08-18: The Backend Endpoint data boundary was fixed as one Core-owned ordered `ReadableStream<NativeChunk>` plus a repeatably awaitable `exited: Promise<BackendExitResult>`. `BackendExitResult` was narrowed to `{ exitCode: number | null; signal: string | null }`; signal controls remain Backend-specific. Native representation tags remain explicit, public stream cancellation never propagates as Endpoint cancellation, and exit observation remains independent from transport EOF and close.
- 2026-08-18: The Backend Endpoint input boundary was fixed as synchronous `write(NativeInput): boolean` plus `drain(): Promise<void>`. Core owns public input representation selection, while Backend owns native acceptance, queue policy, and any explicit `writeDecode` convenience; no second WritableStream protocol was introduced.
- 2026-08-18: The Backend Endpoint resize boundary was fixed as synchronous `resize(cols, rows): void`, mirroring the public operation. Core owns shared Character-Cell Size validation; Backend owns execution and explicit unsupported reporting.
- 2026-08-18: The Backend Endpoint lifecycle boundary was fixed as idempotent synchronous `close(): void` and `terminate(): void`. They remain non-cascading; Core publishes public `closed` before invoking physical close and preserves the independent exit observation.
- 2026-08-18: The configured Core lifecycle was given graceful `UniPty.dispose(): Promise<void>` semantics. It blocks new spawns immediately, reuses one disposal Promise, leaves live PTYs under caller-owned lifecycle, waits for each to close, and only then releases Backend shared resources; only release failure rejects.
- 2026-08-18: The Core-facing Backend contract was fixed to a structurally ready object with synchronous `spawn(launch): BackendEndpoint`. Async factory, constructor, and `.ready()` work remains Backend-package acquisition convention and is never required by Core.
- 2026-08-18: Backend selection was fixed to direct ready-object injection through `new UniPty({ backend })`; Core accepts no Backend name, registry, or factory. This revised the earlier non-generic suggestion: `UniPty<TBackend>` now preserves the concrete Backend type and exposes the same instance as readonly `unipty.backend`. Official Backend packages standardize on async `createXxxBackend(options)` factories.
- 2026-08-18: An earlier packaging draft temporarily named the Bun route `@unipty/bun` and the Deno route `@unipty/deno-ffi`; that draft was later superseded by the uniform Backend namespace decision below.
- 2026-08-18: Node, Bun, and Deno were all made mandatory first-phase Backend routes across implementation, documentation, CI contract coverage, and release acceptance. The initial route labels were `node-pty`, `bun`, and `deno-ffi`; per-tuple evidence still gates verified support claims.
- 2026-08-18: Concrete Backend package names were reopened for a uniform `@unipty/*-backend` or `@unipty/backend-*` convention. The initial Deno route label `deno-ffi` was later superseded by the substrate label `pty-ffi`; previous runtime-shaped names are not final package names.
- 2026-08-18: Concrete Backend package naming was fixed to the `@unipty/backend-*` namespace: `@unipty/backend-bun`, `@unipty/backend-node-pty`, and `@unipty/backend-deno-sigma__pty-ffi`; substrate labels remain authoritative.
- 2026-08-18: Added `@unipty/backend` as a convenience package for autoResolve. It must return a ready Backend to Core and cannot introduce Core fallback or an implicit plugin registry; discovery and bundler semantics remain a separate decision.
- 2026-08-18: autoResolve research established that runtime-native resolution must use an explicit caller/project base rather than scan `node_modules`; optional peer metadata does not install a Backend. Termless's current convenience path is a closed known-name registry plus CLI install/doctor, while explicit factories remain preferred. UniPty still needs its own ambiguity and bundle-manifest decisions.
- 2026-08-18: AutoResolve naming and behaviour were fixed as `resolveUniPtyBackend(packageName)` plus `autoResolveUniPtyBackend()`. The algorithm remains runtime-first two-stage resolution: explicit `candidates` first, terminal warning on unavailable configured candidates, then `package.json`-derived `fallbackCandidates`; the pure function handles one package per call without import, while the auto function loops candidates and imports only the selected Backend before calling its factory. Manual import plus factory remains equivalent and supported.
- 2026-08-18: Official Backend metadata was given a required `backend.factoryExport` field, and its optional support matrix was fixed to per-runtime/OS/arch statuses `verified | unverified | unsupported` with `stable | experimental` maturity. Evidence status constrains claims and preselection only; it never replaces actual import, factory readiness, or public operation results.
- 2026-08-18: Resolver base semantics were fixed: pure `resolveUniPtyBackend()` requires an explicit caller `from: URL`; `autoResolveUniPtyBackend()` may provide a convenience default only from a trustworthy runtime project context and never from the convenience package's own module location. Bundle, Deno import-map, and embedded-library callers must pass `from` explicitly.
- 2026-08-18: AutoResolve was split into three observable stages: pure `resolveUniPtyBackend()` resolves package and metadata locations, `inspectUniPtyBackend()` imports and validates only metadata, and `autoResolveUniPtyBackend()` performs selected package import, factory lookup, and readiness after those stages.
- 2026-08-18: Resolver and metadata inspection return shapes were fixed as discriminated reports: resolution distinguishes `resolved` from `unresolved`; inspection distinguishes `compatible`, `incompatible`, `metadata-missing`, and `metadata-invalid`. Neither report claims Backend loadability or readiness.
- 2026-08-18: AutoResolve warning delivery was fixed as an optional structured `onWarning` sink with `console.warn` as the default; pure resolve and metadata inspection remain output-silent and return diagnostics only.
- 2026-08-18: Candidate ambiguity policy was fixed: explicit candidates use ordered first-compatible selection; fallback candidates require exactly one compatible result, otherwise zero follows normal failure and multiple returns `ambiguous`. Package.json and filesystem order never imply priority.
- 2026-08-18: Candidate fallback was separated from initialization fallback: resolve/inspect failures may continue, but after selection any package import, factory, or readiness failure is terminal and never silently switches Backend.
- 2026-08-18: Selected-candidate initialization failures were fixed as rejected structured errors with code `backend-initialization`, stage `import | factory-export | factory-call | ready`, selected package, preceding inspection report, and original cause.
- 2026-08-18: Bundled deployment support was fixed as an explicit `autoResolveUniPtyBackend({ manifest })` path. The manifest supplies static metadata plus bundler-visible loaders and bypasses runtime package resolution; native asset externalization remains Backend/build owned.
- 2026-08-18: The explicit manifest path was given a canonical `defineUniPtyBackendManifest()` constructor/validator. It validates the metadata schema and entry identity, requires non-empty factory exports and callable loaders, snapshots the candidate list without executing loaders, and keeps generated output in bundler-neutral ESM/TypeScript rather than JSON-only data. Manifest generation ownership was assigned to the separate `@unipty/helper-backend` build/development helper package; native asset externalization remained open at that point and was resolved by the 2026-08-19 probe below.
- 2026-08-18: Native asset handling was separated from runtime Backend selection. An interim design allowed a helper-internal build-time asset report while excluding it from the runtime manifest. The 2026-08-19 cross-bundler probe below superseded and deleted that report concept entirely.
- 2026-08-18: Generated manifest modules were fixed as ordinary hand-authorable ESM/TypeScript with one default manifest export, static default imports of each package's `./unipty.metadata`, and literal-specifier deferred Backend loaders. Metadata itself uses a default `UniPtyBackendMetadata` export. Module evaluation may validate metadata but never imports Backend entry modules or initializes factories/native resources; generated code embeds neither metadata snapshots nor physical package paths.
- 2026-08-18: `@unipty/helper-backend` generation was fixed as the explicit-input `unipty-helper-backend manifest` CLI plus `generateUniPtyBackendManifestModule()`. Repeatable ordered candidates are mandatory; CLI output is exactly one of `--out` or `--stdout`, existing files require `--force`, diagnostics stay on stderr, and only CLI may default `from` to the current working directory. V1 excludes config files, inferred candidates, bundler plugins, native-asset copying, and `--check`.
- 2026-08-18: Backend support tuples adopted normalized Node/npm platform vocabulary: `os` uses `process.platform`/npm `os`, `arch` uses `process.arch`/npm `cpu`, and optional `libc` remains a separate dimension rather than being folded into an invented combined identifier.
- 2026-08-19: Backend governance was separated into package identity, Core protocol compatibility, maturity/evidence, and acquisition policy. Official identity moved out of self-reported metadata into the repository-owned catalog/release pipeline; `protocol.core` became the hard compatibility declaration; maturity and verification remain advisory orthogonal claims; and no label may influence AutoResolve ordering. Verified tuples now require exact runtime, suite, suite-version, and timestamp evidence, while official presentation requires catalog/CI corroboration.
- 2026-08-19: Consolidation removed support matrices, capability lists, and asset strategy from public Backend Metadata. Metadata now contains only identity, factory, protocol, targets, and optional provenance; a repository-owned catalog is the sole source for verified-support presentation. The inspection seam was narrowed to `BackendResolvedReport` so package resolution is performed once and cannot be conflated with missing metadata.
- 2026-08-19: Runtime probes established the metadata contract on Node 24.19.0, Bun 1.3.14, and Deno 2.9.5 and the deferred manifest seam under Bun and Deno code-splitting bundles. A failed Bun bundle proved that runtime `import.meta.resolve("#index")` cannot participate in metadata evaluation after bundling; the official convention was narrowed to static `#package.json` identity import or build-time normalization.
- 2026-08-19: Compatibility evidence was fixed as positive, release-exact CI output. A deterministic aggregator snapshots validated release metadata and successful public-contract records into one tagged catalog artifact; the website consumes that artifact unchanged. V1 presentation is limited to `verified`, `declared-unverified`, and `not-targeted`, with no self-reported support, permanent failure status, official boolean, or maturity taxonomy.
- 2026-08-19: Real Bun/esbuild `node-pty` spawn probes and the Deno FFI path probe rejected a shared native-asset model. V1 deleted both public and helper-internal asset reports; Backend packages and host deployments retain materialization ownership, while Core, metadata, resolver, manifest, and helper carry no asset schema.
- 2026-08-19: The Deno route's distribution was fixed as the npm-only `@unipty/backend-deno-sigma__pty-ffi`. Its pnpm build vendors the required `@sigma/pty-ffi/noinit` JavaScript closure and targeted dynamic libraries into the npm artifact, leaving no runtime `jsr:` imports; packed-artifact conformance under Deno is the release gate.
- 2026-08-19: The final depth/deletion review found no remaining architecture choice. Native asset reports and dual-registry Deno distribution were deleted; all remaining evidence is implementation acceptance. The living spec advanced from `drafting` to `ready-for-agent` as the Wayfinder map reached its destination.
- 2026-08-19: Official-site deployment was corrected from Cloudflare Pages to GitHub Pages. The Owner retains the `unipty.jixoai.com` CNAME mapping, the sibling OpenSpecUI website is the implementation-time visual reference, and framework/style implementation investigation remains assigned to the future website developer rather than this architecture pass.
- 2026-08-18: `ReadyPtyBackend` was extended with required `dispose(): Promise<void>`. Graceful `UniPty.dispose()` waits for every existing PTY to close and then invokes this Backend shared-resource hook exactly once.
- 2026-08-18: Backend Endpoint acquisition was initially made asynchronous at the public boundary.
- 2026-08-18: That decision was revised after review: asynchronous work belongs to one-time Backend readiness, while a ready Backend is injected into `new UniPty(options)` and `unipty.spawn()` is synchronous.
- 2026-08-18: A configured `UniPty` instance was fixed as the ownership boundary for one ready Backend and multiple per-instance PTYs; cross-Core Backend sharing remains unspecified.
- 2026-08-18: Options were partitioned by ownership: Core-wide configuration at `UniPty`, launch and initial size at `spawn`, representation at `stream`, and implementation/remote policy at Backend readiness.
- 2026-08-18: The public launch shape was fixed as Bun-style `unipty.spawn(argv, options)` with a non-empty argv vector and no string-command or implicit-shell path.
- 2026-08-18: Initial geometry was fixed under `spawn`'s nested `terminal: { cols, rows }` option, matching Character-Cell Size terminology and preserving a terminal-level namespace.
- 2026-08-18: Default terminal geometry was fixed to resolve per dimension as explicit value, valid host-environment `COLUMNS`/`LINES`, current TTY size, then `80 × 24`; this follows POSIX's user-preference semantics and current Python standard-library practice. `spawn`'s child `env` remains launch context, not an implicit Core geometry override.
- 2026-08-18: structured launch was accepted as the core input; shell parsing moved to optional official ecosystem packages.
- 2026-08-18: Shell Script Request was accepted as an explicit parser result requiring caller approval and a named shell policy.
- 2026-08-18: public-contract conformance was accepted as the single testing seam.
- 2026-08-18: the spec became a living `drafting` artifact; `ready-for-agent` is deferred until Wayfinder reaches its destination.
- 2026-08-18: Termless research separated its VT-emulator Backend from its optional Node/Bun PTY adapter; no Termless emulator interface was adopted as PtyBackend.
- 2026-08-18: Runtime research versioned candidate facts and macOS arm64 probes; Deno `@lydell/node-pty` loading was explicitly rejected as compatibility proof.
- 2026-08-18: Geometry precedence was checked against current primary documentation: POSIX defines `COLUMNS`/`LINES` as the user's preferred dimensions, Python 3.14 checks those variables before querying the host terminal and falls back to `80 × 24`, while Node exposes TTY detection and dimensions without prescribing a competing precedence. UniPty therefore adopts environment-first resolution while keeping explicit `terminal` values authoritative.
- 2026-08-18: Parser research identified Bash thin-wrapper candidates and kept PowerShell behind an optional official-parser adapter; no shared AST was adopted.
- 2026-08-18: The earlier bytes-only Backend decision was revised: Backends may expose native bytes, native text, or both; the official text view prefers native text and decodes bytes only when needed.
- 2026-08-18: Automatic conversion was made asymmetric: bytes may derive text, while text never derives a claimed raw-byte channel.
- 2026-08-18: Terminal Stream representation was selected explicitly with `pty.stream({ encoding: "utf8" | "bytes" })`; the stream interface remained open at that point and was fixed by the next decision.
- 2026-08-18: Terminal Stream was fixed as a Web ReadableStream with representation-specific `string` or `Uint8Array` chunks; Buffer remains an allowed native subtype, not the public type.
- 2026-08-18: Public input was fixed as `string | Uint8Array`; native representations pass through, while string may be UTF-8 encoded for a byte-native Backend.
- 2026-08-18: Strict upper-layer input semantics were retained, while a text-only Backend may explicitly opt into a stateful `writeDecode: true | TextDecoder` convenience policy for byte writes.
- 2026-08-18: `write()` was fixed as a synchronous boolean readiness signal; both outcomes mean full acceptance, and neither reports byte length or delivery completion.
- 2026-08-18: `drain()` was fixed as a Promise-based Write Readiness wait, explicitly distinct from a physical PTY flush barrier.
- 2026-08-18: Backpressure was made advisory rather than a write lock; bounded saturation rejects one whole value explicitly instead of partially accepting or dropping it.
- 2026-08-18: Numeric input queue policy remained Backend-owned; UniPty v1 standardizes observable pressure behaviour but no portable capacity unit.
- 2026-08-18: Terminal Stream cancellation was decoupled from PTY and process lifetime; cancellation detaches only the current output view.
- 2026-08-18: Output retention was split by phase: bounded lossless bootstrap before the first view, then drain-and-discard with no core replay after all established views detach.
- 2026-08-18: UniPty was limited to one active Terminal Stream per PTY; callers explicitly use `stream.tee()` when they accept Web Streams branch semantics.
- 2026-08-18: The common resize surface was narrowed to positional positive integer character cells; pixel dimensions remain Backend-specific.
- 2026-08-18: Resize was confirmed as `resize(cols, rows): void` over finite positive integer character cells; acceptance is distinct from child observation, and unsupported limits remain Backend-specific.
- 2026-08-18: Terminal transport EOF/error and Process Exit Result were fixed as independent observations with no synthesized combined status.
- 2026-08-18: `close()` was fixed as an idempotent resource/transport close that rejects later I/O and stream creation without promising child-process termination; explicit termination remains separate.
- 2026-08-18: `terminate()` was fixed as an idempotent synchronous termination request; it accepts the request without waiting for or synthesizing the independent Process Exit Result.
- 2026-08-18: `terminate()` and `close()` were fixed as non-cascading lifecycle operations; callers explicitly request both effects and choose their order.
- 2026-08-18: Existing Process Exit Result observation was fixed to survive `close()` even when the child remains alive; close still invalidates PTY I/O surfaces.
- 2026-08-18: `close(): void` was fixed as a synchronous logical close: `closed` is observable before return, while physical transport cleanup and stream completion may finish asynchronously.
- 2026-08-18: Explicit close was fixed to complete the active Terminal Stream normally; transport read failures remain stream errors.
- 2026-08-18: Signal-specific controls such as `kill(signal)` were excluded from the common API and Endpoint minimum, reserved for explicit Backend capability objects with Backend-owned signal vocabularies and typed unsupported behaviour. Public `Pty` has no universal `kill()` method.
- 2026-08-18: Common operational failures were fixed to use stable discriminant error codes (`unsupported`, `closed`, `backpressure`, `invalid-argument`, `active-stream`) with optional Backend-specific details and causes, not shared Error class identity.
- 2026-08-18: Backend capability access was fixed as opaque token lookup `capability<T>(token: CapabilityToken<T>): T | undefined`, with one stable singleton token per Backend package and object-identity matching. No global string registry or forgeable capability name is used; Core remains unaware of capability-specific methods, and token presence does not replace operation results.
- 2026-08-18: Capability package compatibility was made strict by loaded package-instance identity. Tokens from duplicate installed copies are intentionally distinct, lookup returns `undefined`, and Core provides no string-name compatibility fallback.
- 2026-08-18: Backend-internal physical teardown order was left implementation-owned; only public closed-state, stream-completion, and exit-observation outcomes are portable.

## Comments

- 2026-08-18: Reopened the earlier concrete Node/Bun/Deno package names after the requirement for a uniform namespace.
- 2026-08-18: Selected `@unipty/backend-*` as the uniform Backend package namespace and fixed the three first-phase package names; the Deno FFI route was renamed first to `@unipty/backend-pty-ffi` and then corrected to the more provenance-explicit `@unipty/backend-deno-sigma__pty-ffi`, with `createDenoSigmaPtyFfiBackend()` as its factory; `@unipty/backend` remains the separate autoResolve convenience package.
- 2026-08-18: Recorded current primary-source research on autoResolve. It rejected `node_modules` scanning and implicit installation in favour of caller-rooted resolver checks, explicit factories, and a deployment-owned bundle manifest or external list.
- 2026-08-18: Corrected the historical Bun platform boundary: v1.3.13 covered Linux/macOS and v1.3.14 added Windows ConPTY; classified `@sigma/pty-ffi` as a Deno FFI candidate rather than a runtime-neutral PTY package.
- 2026-08-18: Initial living spec synthesized from the confirmed conversation decisions.
- 2026-08-18: Synchronized verified Termless architecture findings without promoting research inferences to product decisions.
- 2026-08-18: Synchronized runtime and PTY evidence while leaving I/O and lifecycle recommendations open for HITL decision.
- 2026-08-18: Synchronized parser ecosystem evidence while leaving package selection and PowerShell hosting open.
- 2026-08-18: Revised the data plane from bytes-only to representation-aware and fixed the text convenience layer inside the main package.
- 2026-08-18: Removed derived bytes from Terminal Bytes and made text-only Backend limitations explicit.
- 2026-08-18: Added the confirmed Terminal Stream selector without prematurely choosing its concrete stream primitive.
- 2026-08-18: Confirmed async iteration over both stream variants while leaving cancellation and process-lifetime coupling open.
- 2026-08-18: Added the Backend-owned write decoder without turning byte-to-text decoding into a universal UniPty conversion.
- 2026-08-18: Replaced Bun's byte-length write result with representation-neutral Write Readiness, preserving a synchronous fast path without forcing native text through an encoder.
- 2026-08-18: Confirmed `drain()` waits for readiness recovery rather than claiming that all underlying PTY buffers are empty.
- 2026-08-18: Preserved permissive Bun/Node-style writes after backpressure while requiring bounded queues and typed saturation failure.
- 2026-08-18: Kept representation-specific queue costs out of the common options and allowed Backend packages to expose their own tuning policy.
- 2026-08-18: Fixed Web Stream cancellation as output-view detachment so lifecycle changes remain explicit operations.
- 2026-08-18: Protected startup output without turning the core into scrollback storage; explicit Backend extensions retain ownership of replay.
- 2026-08-18: Kept fan-out and slow-branch policy outside the PTY core by selecting one active view plus caller-owned `tee()`.
- 2026-08-18: Resize acceptance was separated from child observation and platform-specific support; unsupported requests must remain explicit.
- 2026-08-18: Preserved process-exit observation across stream cancellation and refused to infer clean process completion from transport EOF.
- 2026-08-18: Added the close boundary while leaving termination request, kill/signal capability, and teardown ordering open for the next decision.
- 2026-08-18: Added the common termination request while leaving signal-specific controls and teardown ordering open for the next decision.
- 2026-08-18: Kept signal control Backend-specific while leaving teardown ordering open for the next decision.
- 2026-08-18: Confirmed that terminate and close do not implicitly invoke one another; post-close exit-observation lifetime remained open at that point and was fixed by the next decision.
- 2026-08-18: Confirmed that close preserves established Process Exit Result observation and normally completes the active Terminal Stream.
- 2026-08-18: Fixed the Endpoint output boundary as one Core-private ordered native stream, preserving one public stream owner and preventing public cancellation from tearing down Backend output.
