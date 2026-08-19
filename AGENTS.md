# UniPty Architecture Context

> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai; original request:
> unify Deno, Node, and Bun PTY interfaces through replaceable Backends):
> planning artifacts, v1 scope, evidence and governance, shell parsing, data plane.

## Planning Artifacts

`CONTEXT.md` and `i18n.zh.md` own domain language. The active Wayfinder map and
living spec are under `.scratch/unipty-v1/`. The map has reached its destination
and the spec is `ready-for-agent`; implementation contradictions must update the
spec before supporting documents. Accept public behaviour through one contract-
suite seam, never through adapter-internal tests.

## V1 Scope

The v1 core is limited to PTY. Persistent or reconnectable sessions belong in
replaceable Backends, including backend-wrappers; they are not a second plugin
lifecycle. Keep the public contract runtime-neutral.
PtyBackend supplies a Core-private Backend Endpoint and never constructs the
public `Pty`. Each Endpoint exposes one ordered private
`ReadableStream<NativeChunk>` source consumed only by Core; chunks explicitly
tag native bytes, native text, or both. Core alone owns public streams,
bootstrap buffering, conversion, backpressure, common errors, and lifecycle
state. Public stream cancellation detaches the public view and does not cancel
the private source by itself. The Endpoint also exposes a repeatably awaitable
`readonly exited: Promise<BackendExitResult>` for child completion; it remains
independent from transport EOF, stream cancellation, and close.
`BackendExitResult` is `{ exitCode: number | null; signal: string | null }`;
`signal` records the observed termination cause only and is not a common
`kill(signal)` vocabulary.
Endpoint input is synchronous `write(input: NativeInput): boolean` plus
`drain(): Promise<void>`; Core selects native bytes or text from public input,
while Backend owns acceptance, queue policy, and any explicit write decoder.
Endpoint resize mirrors the public `resize(cols, rows): void`; Core validates
finite positive Character-Cell Size values, while Backend executes or reports
explicit `unsupported`.
Endpoint lifecycle mirrors public `close(): void` and `terminate(): void`;
both are idempotent, synchronous, and non-cascading. Core publishes public
`closed` before invoking physical Endpoint close and retains exit observation.
Backend readiness happens before Core construction: factories or `.ready()` may
perform one-time runtime loading, connection, authentication, and capability
negotiation. A ready Backend is injected into `new UniPty(options)`, after which
`unipty.spawn()` and the public PTY's write, resize, terminate, and close
contracts remain synchronous.
One `UniPty` instance owns one ready Backend and may create multiple independent
PTYs; do not assume or require the same Backend instance to be shared across
multiple Core instances.
`UniPty<TBackend>` preserves the concrete ready Backend type and exposes the
same instance as readonly `unipty.backend: TBackend`; do not erase it behind an
untyped wrapper. Official Backend packages use async
`createXxxBackend(options): Promise<XxxBackend>` factories, while Core accepts
only their ready result and never a name, registry entry, or factory.
The first phase must deliver Node, Bun, and Deno Backend routes together and
include all three in implementation, documentation, CI contract coverage, and
release acceptance. Concrete Backend packages use the uniform
`@unipty/backend-*` namespace: `@unipty/backend-bun`,
`@unipty/backend-node-pty`, and `@unipty/backend-deno-sigma__pty-ffi`. Their
route identities remain the actual substrates `bun`, `node-pty`, and
`@sigma/pty-ffi`; Deno is runtime metadata for the last route, not its sole
implementation name. The Deno route is an npm-only package whose pnpm build
vendors the required `@sigma/pty-ffi/noinit` JavaScript closure and targeted
dynamic libraries. Published runtime modules contain no unresolved `jsr:`
specifier; the Backend factory owns exact tuple asset selection and explicit
initialization. Packed npm artifact conformance under Deno is mandatory, and
the normal host-bundle recipe keeps the package external so its private asset
tree remains intact. `@unipty/backend` is a separate convenience package
whose autoResolve entry simplifies Backend acquisition; its discovery algorithm
and bundler contract are tracked separately. Official packages expose a
side-effect-free `./unipty.metadata` exports subpath as a static metadata/build
hook; this is not a general npm discovery standard. No
target runtime/platform tuple
becomes verified support without the public contract suite; evidence gating
limits support claims, not first-phase implementation.
`autoResolveUniPtyBackend` first analyzes the current runtime. An optional
`candidates: string[]` list is processed first; unavailable configured candidates
emit a terminal warning, then resolution falls back to candidates inferred from
the consumer's `package.json` dependency information. The public pure
`resolveUniPtyBackend(packageName)` analysis handles exactly one package
specifier per call and may inspect an explicitly selected runtime without
importing or initializing any Backend. `autoResolveUniPtyBackend` loops the
ordered candidates through this single-package function; only its selected
result is imported and passed through the async factory. Manual `await import()`
plus `createXxxBackend()` remains a first-class path.
Official Backend packages must expose `./unipty.metadata` as the public
side-effect-free Backend Metadata Protocol. They may statically import package
identity through a package-local `package.json#imports` alias such as
`#package.json`; Node 24.19.0, Bun 1.3.14, and Deno 2.9.5 passed that contract.
Never execute `import.meta.resolve("#index")` or another package-scoped resolver
inside metadata module evaluation: Bun bundling preserves that expression after
moving the module outside its package scope, where it fails. An optional
`#index` alias remains package-internal and unbundled only; it is not a metadata
field, build hook, or evaluation dependency.
The official metadata minimum schema requires normalized package identity,
Backend identity, the mandatory `backend.factoryExport` name, `protocol.core`,
and target declarations for side-effect-free runtime/platform prefiltering; its
optional provenance only describes implementation kind and substrate. This
declaration never proves module loadability or Backend readiness. Metadata
contains no maturity, verified-support, capability, native-asset, or official
identity claim. The release-attached repository-owned Official Catalog is the
sole source for verified support presentation. It snapshots validated official
Backend metadata and contains only positive full-suite Verification Evidence
for exact Backend/Core versions, runtime version, OS/arch/libc, suite/version,
tested commit, timestamp, and optional stable report. CI failures or missing
records are never permanent unsupported claims. Documentation derives only
`verified`, `declared-unverified`, and `not-targeted`; v1 adds no official
boolean or maturity taxonomy. The catalog is never a Core, resolver,
AutoResolve, or candidate-ordering dependency.
Conformance CI emits one evidence artifact only after full public-contract
success. A deterministic aggregator validates identity, versions, tuple,
commit, uniqueness, and required route coverage, then attaches one catalog JSON
artifact to the corresponding tagged release. First-phase release requires at
least one native passing tuple for each official Node, Bun, and Deno route.
`packages/www` consumes one explicitly selected release artifact unchanged.
Target identifiers use normalized Node/npm platform tokens: `os` follows
`process.platform`/npm `os`, `arch` follows `process.arch`/npm `cpu`, and
`libc` is independent and required for Linux native evidence; runtime adapters
normalize Bun and Deno values instead of inventing combined platform strings.
Pure `resolveUniPtyBackend` requires an explicit caller `from: URL`; convenience
autoResolve may infer a base only from a trustworthy runtime project context and
must never use `@unipty/backend`'s own module location as the caller. Bundled,
Deno import-map, and embedded-library callers pass `from` explicitly.
The acquisition stages remain separate: pure `resolveUniPtyBackend()` resolves
locations only; `inspectUniPtyBackend()` accepts only a successful resolution
and imports/validates metadata without factory/native initialization;
`autoResolveUniPtyBackend()` initializes only the selected Backend.
Resolver reports are discriminated: `resolved | unresolved` only describe
locations, with `metadataUrl` optional for a package lacking the metadata
subpath. Inspection reports use `compatible | incompatible | metadata-missing |
metadata-invalid`; neither report implies module loadability or Backend
readiness. Public resolver values use `BackendDiagnostic`,
`UniPtyBackendWarning`, `BackendModule`, and the stable common `UniPtyError`
codes specified in the living spec; native resolver diagnostic codes remain open.
AutoResolve uses an optional structured `onWarning` sink and defaults to the
host `console.warn`; pure resolve and metadata inspection never write output.
Explicit candidates are ordered first-compatible; fallback candidates require one
compatible result and return `ambiguous` for multiple matches. Never infer
priority from package.json or filesystem order.
Fallback ends before effectful initialization; selected-candidate import, factory,
or readiness failure is terminal and never silently tries a later Backend.
AutoResolve rejects selected-candidate effect failures with structured code
`backend-initialization`, preserving package, stage, inspection report, and cause.
Bundled deployments use an explicit build-time manifest with static metadata and
bundler-visible loaders; supplying it bypasses runtime package resolution and
does not move native-asset ownership into Core. `defineUniPtyBackendManifest()`
is the canonical `@unipty/backend` constructor/validator: it requires a
non-empty entry set, valid metadata, unique package identity matching, a
non-empty factory export, and callable loaders; it snapshots the input without
calling loaders. Manifest generation belongs to the separate
`@unipty/helper-backend` build/development helper package, which is outside the
`@unipty/backend-*` runtime namespace. Generated manifests are bundler-neutral
ESM/TypeScript modules with one default manifest export. They statically default-
import each package's `./unipty.metadata` and use literal dynamic-import
specifiers only inside deferred Backend loaders. Metadata subpaths default-export
`UniPtyBackendMetadata`; generated code never embeds metadata snapshots or
physical package paths. Evaluating a generated module may validate metadata but
must not import Backend entry modules, call factories, or initialize native
resources. The format is hand-authorable without helper runtime support. Runtime
manifests carry no native-asset paths or externalization directives. V1 has no
public or helper-internal asset report, no second `./unipty.build` protocol, and
no generic asset copier or downloader. Backend packages and host deployments
own native materialization; the helper generates only the explicit Backend
manifest.
`@unipty/helper-backend` exposes `unipty-helper-backend manifest`. It requires
one or more ordered repeatable `--candidate` values and exactly one of `--out`
or `--stdout`; overwrite requires `--force`, source stays on stdout/file, and
diagnostics stay on stderr. CLI `--from` is optional and otherwise uses cwd;
the programmatic `generateUniPtyBackendManifestModule()` always requires
`from: URL` and returns source without file writes. Never infer candidates from
package.json, scan node_modules, install packages, import Backend entries, call
factories, or initialize native resources. V1 has no helper config, bundler
plugin, native-asset copier, or `--check` contract.
`packages/www` is a separate private workspace site deployed as a static GitHub
Pages site. The Owner manages the `unipty.jixoai.com` CNAME mapping. At website
implementation time, use the sibling `../openspecui` official site as the visual
reference; do not make it a source dependency. The architecture does not fix a
site framework or Pages workflow: the website implementer inspects OpenSpecUI
and chooses those details without reopening Core or Backend contracts.
`UniPty.dispose(): Promise<void>` is the Backend-level lifecycle boundary: it
blocks new spawns immediately and releases shared Backend resources
asynchronously without implicitly closing or terminating existing PTYs. It is
graceful: repeated calls reuse one Promise, existing PTYs stay caller-owned,
and disposal waits for all of them to close before releasing Backend resources;
only resource-release failure rejects.
Core accepts only a structurally ready Backend with synchronous
`spawn(launch: StructuredLaunch): BackendEndpoint` and asynchronous
`dispose(): Promise<void>`. Backend factory, constructor, and `.ready()` calls
are package-owned acquisition conventions and are never required by Core.
Graceful `UniPty.dispose()` waits for all existing PTYs to close, then invokes
the Backend disposal hook exactly once.
Keep options at their narrowest owner: Core-wide policy at `new UniPty`, launch
and initial size at `spawn`, representation at `stream`, and native/connection/
queue/persistence/remote configuration at Backend readiness. Never flatten them
into one universal options bag.
The public launch entry is Bun-style `unipty.spawn(argv, options)`: argv is
non-empty, its first value is the executable, no string-command overload exists,
and Core never implicitly invokes a shell.
Initial PTY geometry stays under nested `spawn` option `terminal: { cols, rows }`
and uses Character-Cell Size semantics; do not flatten it into top-level options.
For omitted dimensions, resolve independently as explicit value, valid
`COLUMNS`/`LINES` from the Core host environment, current host TTY when a
trustworthy runtime probe exists, then `80 × 24`; invalid environment values
fall back per dimension, while explicitly invalid terminal values fail. The
child `env` passed to `spawn` is launch context and does not silently override
Core geometry.

## Evidence Boundaries

Termless `Backend` means VT emulator, not PTY host; do not map its interface to
PtyBackend. Native-addon loading is not compatibility: the 2026-08-18 Deno
`@lydell/node-pty` macOS probe initialized but produced no data or exit callback.
Only the public contract probe establishes support.
Treat Bun PTY support as versioned evidence: v1.3.13 introduced
`Bun.Terminal` on Linux/macOS, while v1.3.14 added Windows through ConPTY.
`@oven/bun-windows-*` packages are Bun runtime binaries, not a second PTY
Backend. `@sigma/pty-ffi` is a Deno FFI wrapper over Rust `portable-pty`;
cross-OS dynamic libraries do not make it cross-runtime.
The 2026-08-19 metadata fixture passed `./unipty.metadata`, static
`#package.json`, package-private `#index`, and side-effect separation on Node
24.19.0, Bun 1.3.14, and Deno 2.9.5. Bun and Deno code-splitting bundles also
preserved `0 -> 1` Backend-entry evaluation across the deferred manifest loader;
this validates the manifest seam, not native-asset externalization.

## Shell Parsing

Shell parsing is an optional official ecosystem concern and never implicit core
evaluation. Do not invent a shared shell AST. Bash candidates may be wrapped
behind classification results; PowerShell semantics remain an optional adapter
to the official parser unless equivalent evidence is found.

## Data Plane

Backends may expose native bytes, native text, or both. Text prefers native text
and otherwise decodes bytes incrementally; text never becomes claimed raw bytes.
The public selector is `pty.stream({ encoding: "utf8" | "bytes" })`: `utf8`
selects `ReadableStream<string>` Terminal Text and `bytes` selects
`ReadableStream<Uint8Array>` native Terminal Bytes. Native Buffer instances may
pass through as Uint8Array values; Buffer is not the public type. Public writes
accept `string | Uint8Array`: preserve a Backend's native representation and
only encode string for byte-native input. Never decode bytes for text-only input
in the strict upper layer; only an explicit Backend-owned
`writeDecode: true | TextDecoder` may provide that convenience. `write()`
returns boolean Write Readiness: either value means complete acceptance exactly
once; `false` only tells the caller to pause for drain and never to retry.
`drain(): Promise<void>` waits for readiness recovery and is not a physical PTY
flush or child-consumption guarantee. Backpressure is advisory: later writes may
still succeed while bounded capacity remains, but saturation must reject one
whole value with a typed failure; never partially accept, silently drop, or use
an unbounded queue. Numeric queue policy belongs to each Backend and is not a
common UniPty option; standardize only readiness, drain, and saturation outcomes.
Terminal Stream cancellation only detaches that output view; it never closes
PTY input or transport and never terminates the child process. Preserve startup
output in a bounded Bootstrap Output Buffer before the first view; after all
established views detach, keep draining and discard until a future-only view
subscribes. Core never implies retention or replay. Allow one active Terminal
Stream per PTY; caller-owned `stream.tee()` is the only v1 fan-out mechanism.
The common resize API is `resize(cols, rows)` over positive integer character
cells only; pixel dimensions and platform-specific controls stay Backend-specific,
and unsupported resize must be explicit. Terminal Stream completion reports
transport EOF/read error only; Process Exit Result remains an independent
observation and survives stream cancellation.

Lifecycle boundary: `close(): void` is an idempotent logical resource/transport
close that publishes `closed` before returning. After close, reject `write()`,
`resize()`, and new `stream()` creation with the common `closed` code. Physical
cleanup may finish asynchronously; close alone does not terminate the child.
The common `terminate()` operation is an idempotent synchronous termination
request: acceptance does not wait for or synthesize the independent Process Exit
Result.
Signal-specific controls such as `kill(signal)` live only in explicit Backend
capability objects, not the Endpoint minimum or public v1 common API. A Backend
owns its signal vocabulary and must expose undeclared or unsupported values
explicitly rather than silently mapping them to another signal or terminate.
Public `Pty` exposes opaque token lookup
`capability<T>(token: CapabilityToken<T>): T | undefined`; Backend packages own
one stable singleton token per capability and its branded capability type; Core
matches object identity rather than a global string registry, treats the
payload as opaque, and never treats token presence as operation success. Tokens
from duplicate loaded package copies are intentionally incompatible and return
`undefined`; never add a string-name fallback.
Lifecycle operations are non-cascading: `terminate()` does not implicitly close
the PTY transport, and `close()` does not implicitly terminate the child.
Backend internals own physical teardown ordering for transport handles,
decoders, listeners, and exit watchers; common law covers only observable
closed-state, stream-completion, and exit-observation outcomes.
An already-established Process Exit Result observation does survive close, even
if the child remains alive; close still invalidates all PTY I/O surfaces.
An active Terminal Stream completes normally on explicit close; independent
transport read failures still error the stream, and no new stream is allowed
after close.
Public operational failures use stable `error.code` values rather than shared
Error class identity. The common v1 codes are `unsupported`, `closed`,
`backpressure`, `invalid-argument`, and `active-stream`; Backend-specific
diagnostics belong in structured details or a cause, never in message text.
Capability objects are Backend extensions retrieved through their opaque token;
operation results remain authoritative, and metadata never triggers implicit
fallback.
