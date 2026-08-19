# Unipty Context

> Orthogonal terms (maintained 2026-08-19 Asia/Shanghai; original request:
> unify the PTY interfaces of Deno, Node, and Bun while allowing developers to
> choose or implement a Backend): Core/Backend seam, PTY data and lifecycle,
> acquisition, compatibility evidence, optional ecosystem. This glossary
> intentionally contains no implementation decisions.

## Terms

### UniPty

The public, runtime-neutral PTY abstraction that this project intends to
publish.

### Backend

A selectable implementation that fulfils the UniPty contract using a concrete
runtime, native binding, process host, or external terminal system.

### PtyBackend

The Core-facing extension contract through which a ready Backend synchronously
spawns Core-private Backend Endpoints and later releases shared resources.
Core alone constructs public `Pty` values and owns their portable data,
lifecycle, error, and capability-discovery semantics.

### Backend Endpoint

The private boundary a Backend provides to UniPty Core for one PTY instance.
It is not the public PTY abstraction; Core translates it into that abstraction
and owns the shared public behaviour. Its data plane is one ordered private
`ReadableStream<NativeChunk>` source read only by Core. Each chunk explicitly
identifies native bytes, native text, or both; public stream cancellation never
cancels this source by itself. The Endpoint also exposes a repeatably awaitable
`readonly exited: Promise<BackendExitResult>` with the minimal result shape
`{ exitCode: number | null; signal: string | null }`; it observes child
completion independently from transport EOF and remains valid after close once
established. The signal field describes the observed cause and is not a common
signal-control vocabulary. Its input surface is synchronous
`write(input: NativeInput): boolean` plus `drain(): Promise<void>`; Core selects
the native input representation and Backend owns acceptance, queue policy, and
any explicit write decoder.

### Native Chunk

An ordered Backend Endpoint fragment carrying an explicit native representation:
bytes, text, or both. A JavaScript runtime value's type is not sufficient to
claim native fidelity, and Core-derived text is never native bytes.

### Native Input

An explicit Endpoint input variant carrying native bytes or native text. Core
selects it from public input, while a Backend may consume byte input through its
own explicit write decoder.

Endpoint resize mirrors the public operation as synchronous
`resize(cols: number, rows: number): void`; Core owns shared Character-Cell Size
validation, while Backend owns execution and explicit unsupported reporting.
Endpoint lifecycle mirrors the public operations as idempotent synchronous
`close(): void` and `terminate(): void`; they are non-cascading, and Core
publishes public `closed` before invoking physical Endpoint close while retaining
the independent exit observation.

### UniPty Instance

A generic configured Core ownership boundary containing one ready Backend and
the policies shared by the PTYs it creates. `UniPty<TBackend>` preserves the
concrete Backend type and exposes the same instance as readonly
`unipty.backend: TBackend`. Cross-instance Backend sharing is not a common
lifecycle guarantee.

### UniPty Disposal

The graceful Core-level `dispose(): Promise<void>` that synchronously blocks new
spawns and returns one stable Promise. Existing PTYs remain under caller-owned
lifecycle; disposal waits for all of them to close, then releases Backend shared
resources. It never closes or terminates a PTY implicitly and rejects only when
Backend resource release fails.

### Options Ownership

The rule that each configuration belongs to the narrowest stable owner: Core,
one launch, one output view, or one Backend. A universal options bag would erase
these boundaries.

Backend Endpoint acquisition follows one-time Backend readiness before Core
construction. Once a ready Backend is injected into Core, per-PTY spawn and the
already acquired PTY's I/O and lifecycle operations are synchronous at the
public boundary.

### Ready PtyBackend

The structural Core-facing contract after Backend acquisition:
`spawn(launch: StructuredLaunch): BackendEndpoint` plus
`dispose(): Promise<void>`. Backend factories, constructors, and `.ready()`
methods are package-owned acquisition conventions, not Core interface
requirements. Core invokes Backend disposal exactly once after all PTYs close.

### Backend Factory

The primary official-package acquisition convention
`createXxxBackend(options): Promise<XxxBackend>`. Core receives only the ready
result and never accepts or invokes the factory itself.

### Backend Metadata

The side-effect-free declaration exported by an official Backend at the public
`./unipty.metadata` subpath. It describes normalized package and Backend
identity, factory export, Core protocol compatibility, and target declarations
used only for side-effect-free runtime/platform prefiltering. Optional
provenance describes implementation kind and substrate. It never initializes
native resources or asserts that a package is ready. It contains no verification,
maturity, capability, native-asset, or official/community claim. Third-party
Backends may omit it and use a manual import path. Official metadata always
declares the factory export name; this identifies an export but does not prove
that importing or initializing it will succeed.

### Backend Target Declaration

The metadata-owned declaration of intended runtime coverage with optional
operating-system, architecture, and libc restrictions. It can preclude a
candidate without side effects but cannot assert support, loadability, or
readiness.

### Platform Tuple

The normalized runtime and host identity used by Backend Target Declarations
and verification records. Its OS and architecture names follow the Node/npm
vocabulary, while libc remains an independent optional native-library dimension.
A tuple is not a combined display string and does not itself prove compatibility.

### Protocol Compatibility

The hard declaration `protocol.core` in Backend Metadata. It names Core protocol
majors accepted by the Backend, independently from package semver and metadata
schema. Missing the active Core major makes metadata inspection incompatible.

### Verification Evidence

A repository-owned positive conformance record establishing one exact
`verified` claim for a Backend/Core package version, runtime version, platform
tuple, suite version, and tested commit. Failed or absent runs produce no
Verification Evidence, and package metadata does not self-attest it.

### Official Catalog

The release-attached, repository-owned artifact consumed by documentation. It
snapshots validated official Backend declarations and their Verification Evidence
without becoming a runtime resolver input or candidate-preference rule.

### Compatibility Presentation State

The documentation-only interpretation of one release tuple: `verified` has
exact evidence, `declared-unverified` matches a target without evidence, and
`not-targeted` is excluded by the release declaration. Failure is not a
permanent support state.

### Resolver Base

The caller-owned module URL used as the reference point for resolving one
Backend package. A pure resolution report requires an explicit Resolver Base;
convenience auto-resolution may infer one only from a trustworthy project
context, never from the resolver package's own installation location.

### Backend Metadata Inspection

The explicit stage that imports one Backend's `./unipty.metadata`, validates its
declarative schema, and reports compatibility without loading the Backend factory
or claiming readiness. It follows pure resolution and precedes selected Backend
initialization.

### Backend Resolution Report

The discriminated result of resolving one Backend package and its metadata
subpath without importing either module. `resolved` identifies the package and
may omit the optional metadata-subpath location; `unresolved` identifies package
resolution failure. It never implies loadability or readiness.

### Backend Inspection Report

The discriminated result after importing and validating Backend Metadata.
`compatible` and `incompatible` describe declaration checks; metadata absence or
invalidity is explicit. The report never implies factory readiness.

### Backend Warning Sink

The caller-owned delivery boundary for non-fatal AutoResolve diagnostics. AutoResolve
defaults to the host console when no sink is supplied; pure resolution and metadata
inspection stay output-silent and return diagnostics instead.

### Backend Diagnostic

A structured resolver or metadata-inspection observation. Its diagnostic `code`
is open because native resolver failures vary by runtime; callers use report
statuses and stable error codes for portable control flow.

### Backend Warning

The structured `candidate-unavailable` notification delivered for a configured
candidate that cannot pass resolution or inspection. It identifies the package,
the `resolve` or `inspect` stage, diagnostics, and an optional cause.

### Candidate Ambiguity

The explicit AutoResolve state in which more than one fallback candidate is
compatible without a caller-provided priority. Explicit candidates are ordered;
fallback selection requires one compatible result and reports ambiguity instead
of guessing from dependency or filesystem order.

### Backend Initialization Failure

The terminal failure after a candidate has been selected and effectful Backend
loading begins. Package import, factory lookup/call, and readiness failures do
not trigger hidden candidate fallback; the selected candidate and structured
cause remain observable.

### Backend Initialization Error

The structured rejected error for a selected Backend whose import, factory
export, factory call, or readiness fails. It preserves the selected package,
failure stage, preceding inspection report, and original cause.

### Bundle Manifest

The explicit build-time set of Backend entries supplied to AutoResolve. Each
entry carries metadata and a bundler-visible loader; when present it replaces
runtime package resolution. Native asset materialization remains outside the
manifest and belongs to the Backend/build contract. The canonical
`defineUniPtyBackendManifest()` constructor validates metadata and entry identity,
captures an immutable candidate snapshot, and never invokes loaders during
construction. Manifest generation belongs to the separate
`@unipty/helper-backend` build/development helper package, outside the
`@unipty/backend-*` runtime namespace. Generated modules expose only a default
validated manifest, statically default-import package metadata, and defer literal
Backend imports behind entry loaders. Metadata subpaths default-export
`UniPtyBackendMetadata`. The format is hand-authorable and module evaluation
never imports Backend entry modules or initializes factories/native resources.
Runtime manifests carry no native-asset paths or externalization directives.
V1 has no public or helper-internal asset report, no second `./unipty.build`
protocol, and no generic asset copier or downloader. Backend packages and host
deployments own native materialization; the helper generates only the explicit
Backend manifest.

### Self-contained Deno Backend Package

The npm-only distribution of `@unipty/backend-deno-sigma__pty-ffi`. Its pnpm
build vendors the JavaScript closure required from `@sigma/pty-ffi/noinit` and
targeted dynamic libraries into the npm artifact, so published runtime modules
contain no unresolved `jsr:` imports. The Backend factory privately selects the
exact tuple library and initializes it explicitly. Packed npm artifact
conformance under Deno, not direct workspace or JSR execution, is the release
boundary. Core, metadata, resolver, Bundle Manifest, and helper neither expose
nor reconstruct the package's asset layout.

### Backend Module

The module namespace returned by a deferred Bundle Manifest loader. Its public
shape is only `object`; the factory export is looked up and validated after a
candidate is selected, never guessed from the module namespace.

### Backend Manifest Generator

The explicit-source generator owned by `@unipty/helper-backend`. Its CLI is
`unipty-helper-backend manifest`: repeated candidates preserve order, output is
exactly one file or stdout, replacement requires force, and diagnostics remain
on stderr. CLI resolution may default to cwd; the programmatic
`generateUniPtyBackendManifestModule()` requires `from: URL` and returns source
without filesystem writes. It performs metadata work only and never discovers,
installs, imports, or initializes a Backend implementation.

### Package-local Import Map

The private package-owned mapping used to statically derive normalized package
identity for Backend Metadata, normally through `#package.json`. It is an
implementation detail, not a consumer-facing discovery protocol or a substitute
for `exports`. A package-scoped `#index` resolver is not safe during bundled
metadata evaluation and must remain an unbundled internal observation.

### Official Site

The independently deployed documentation and project website for UniPty. It is
a static GitHub Pages deployment from private workspace `packages/www`, not a
runtime package dependency and not a source of Core contract law. The Owner
maintains the `unipty.jixoai.com` CNAME mapping. The sibling `../openspecui`
official site is its implementation-time visual reference only; the website
implementer inspects it and selects the framework, styling, and Pages workflow.

### Backend-wrapper

A Backend that delegates to another terminal system or execution environment
and adapts it to the PtyBackend contract. A backend-wrapper may offer
durability, attachment, or remoting, but those are not UniPty v1 guarantees.

### Shell Parser

An optional, non-executing utility package that translates a particular shell
language's command text into a structured launch request. It is outside the
UniPty core and never makes shell evaluation implicit.

### Structured Launch Request

An explicit request to launch a program using an executable plus arguments,
working directory, and environment. UniPty does not parse shell command text
as part of this request.

### Argv Launch Input

The explicit non-empty executable-plus-arguments vector used to start a PTY.
Its values are data, not shell source; shell interpretation requires a separate
named Shell Script Request and caller policy.

### Spawn Terminal Geometry

The initial Character-Cell Size supplied within a launch's terminal scope. It is
distinct from the PTY's later resize operation and from pixel dimensions.

### Terminal Size Resolution

The fallback process for missing launch geometry: explicit values, valid values
from the Core host process environment, current host TTY facts when the runtime
exposes a trustworthy probe, and finally a portable default. Each dimension is
resolved independently. The child environment supplied to `spawn` is launch
context and does not silently override this Core-level resolution.

### Shell Script Request

An explicit request containing a named shell language and source text. A Shell
Parser may produce this result when direct structured launch is impossible;
neither the parser nor UniPty silently chooses the machine's default shell.

### Terminal Emulator Backend

A component that consumes terminal protocol bytes and owns screen state such
as cells, cursor, scrollback, and modes. Termless calls this component a
`Backend`; it is distinct from UniPty's process-facing PtyBackend.

### Terminal Bytes

The native byte representation of active PTY input or output supplied by a
Backend. Text re-encoded into bytes is derived data, not Terminal Bytes; a
text-only Backend has no Terminal Bytes output.

### Terminal Text

The text representation of active PTY input or output. A Backend may provide
it natively; otherwise UniPty may derive it incrementally from Terminal Bytes.
Native and derived text must have the same public text behaviour without
claiming the same underlying fidelity.

### Terminal Stream

An ordered output view of an active PTY in one requested representation. A
Terminal Stream selects either UTF-8 Terminal Text or native Terminal Bytes;
its chunks are transport fragments, not semantic messages. The public stream
supports async iteration over that selected representation.

### Backend Write Decoder

An explicit input capability owned by a text-native Backend that turns Terminal
Bytes writes into Terminal Text. It is opt-in and does not make byte-to-text
conversion a default UniPty behaviour.

### Write Readiness

A signal issued after complete input acceptance that states whether more input
may be written immediately. It never denotes a partial write or delivery to the
child process.

### Drain Wait

A wait for Write Readiness to recover after backpressure. It is not a claim that
the PTY transport is physically flushed or that the child has consumed input.

### Advisory Backpressure

A non-locking pressure signal that asks a writer to pause without forbidding
later write attempts. Input saturation must reject explicitly rather than lose
data or permit unbounded queue growth.

### Backend Queue Policy

A Backend-owned bounded-input policy whose capacity and measurement reflect its
native representation and transport. Its observable pressure behaviour is
portable, but its numeric thresholds are not.

### Terminal Stream Detachment

The end of one Terminal Stream consumer's output view without changing PTY
input, PTY transport, or child-process lifetime.

### Bootstrap Output Buffer

A bounded pre-subscription buffer that preserves startup output for the first
Terminal Stream. It is not scrollback and does not establish replay after a
stream has detached.

### Active Terminal Stream

The sole UniPty-owned live output view of one PTY. Any branches derived from it
are caller-owned views rather than additional UniPty streams.

### Character-Cell Size

The portable PTY geometry expressed as positive column and row counts. Pixel
dimensions and platform-specific terminal controls are outside this shared term.

### Terminal Transport EOF

The end or read failure of the PTY's output transport. It is independent from
whether the child process has completed.

### Process Exit Result

The child process completion observation, separate from Terminal Transport EOF
and from any one output consumer's cancellation. An already-established
observation remains valid after the PTY transport is closed, even if the child
continues running.

An active Terminal Stream completes normally when the caller explicitly closes
the PTY transport. An independent transport read failure still errors the
stream, and no new stream can be created after close.

### Resource/Transport Close

An idempotent `close(): void` operation that publishes the closed state before
returning. After close, the PTY accepts no writes, resize requests, or new
Terminal Streams. Physical transport cleanup may finish asynchronously, and
closing resources does not itself promise child-process termination.

### Termination Request

An idempotent, synchronous request for the Backend to terminate the child
process. Acceptance does not mean that the child has exited; Process Exit Result
remains an independent observation.

### Non-cascading Teardown

The common lifecycle rule that `terminate()` does not implicitly call `close()`
and `close()` does not implicitly request child termination. Callers explicitly
invoke both when they need both effects.

### Signal Control Capability

A Backend-specific capability object for signal-oriented termination controls
such as `kill(signal)`. It is not part of the Endpoint minimum or public
UniPty v1 common API; each Backend owns its accepted signal vocabulary and must
report undeclared or unsupported values explicitly rather than silently mapping
them to another signal or terminate.

### Capability Token

An opaque, Backend-package-owned branded token used by public `Pty` capability
lookup: `capability<T>(token: CapabilityToken<T>): T | undefined`. Each Backend
package exports one stable singleton token per capability; Core matches object
identity, not a global string registry. Only the token from the same loaded
package instance is compatible; duplicate package copies are distinct and
lookup returns `undefined` without a string-name fallback. Core does not
interpret the returned capability payload; token presence is not an operation
success guarantee.

### UniPty Error

The public operational-error shape: a stable common `code` plus optional
structured `details`. It does not rely on an Error class identity or message
text, and Backend-specific diagnostics belong in details or a cause.

### Common Error Code

A stable discriminant on a UniPty Error. UniPty v1 recognises `unsupported`,
`closed`, `backpressure`, `invalid-argument`, and `active-stream`.

### Backend-owned Teardown Order

The physical cleanup sequence for transport handles, decoders, listeners, and
exit watchers. UniPty standardises observable close and exit outcomes but does
not prescribe this internal Backend order.
