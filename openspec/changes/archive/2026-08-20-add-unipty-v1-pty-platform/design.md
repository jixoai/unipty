> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): package topology;
> public/runtime seams; task ordering; verification and release evidence.
>
> Original request (2026-08-17 Asia/Shanghai): unify PTY behaviour across Node,
> Bun, and Deno through replaceable Backends. Planning constraint
> (2026-08-19 Asia/Shanghai): this Change plans implementation only; it does not
> authorize application of product code.

## Context

See [proposal.md](proposal.md) for motivation and the six capability specs for
observable requirements. The repository contains the completed architecture in
`unipty/.scratch/unipty-v1/`, but no implementation workspace or OpenSpec main
specs. Node, Bun, and Deno are mandatory first-phase routes with different native
asset and process semantics. The public conformance suite is the only acceptance
seam for a native support claim.

## Goals / Non-Goals

**Goals:**

- Implement one small runtime-neutral Core interface and keep all substrate
  differences behind ready Backends.
- Make explicit manual Backend acquisition the base path; layer deterministic
  acquisition convenience and bundler support without a runtime registry.
- Deliver all three official Backends with package-level deployment ownership.
- Make every release claim traceable to an installed-package native contract run.
- Keep website deployment and evidence presentation independent from runtime.

**Non-Goals:**

- Implement or release shell parser packages, persistence, reconnect, remote
  session management, a second plugin lifecycle, or browser-local PTY.
- Produce a universal native asset manifest, generic native asset copier, or
  bundler plugin.
- Support compatibility shims for a pre-v1 API, because none exists.
- Choose the website framework or reproduce OpenSpecUI implementation details
  during this Change's planning phase.

## Decisions

### 1. Workspace and dependency topology

Use one pnpm workspace. Public implementation packages and their direction are:

```text
packages/unipty                             public Core
        ^             ^               ^
        |             |               |
packages/backend    official Backends and community Backend packages
        ^                  ^             ^
        |                  |             |
packages/helper-backend  backend-node-pty backend-bun backend-deno-sigma__pty-ffi

packages/conformance                       private installed-package test harness
        |
        +--> evidence artifact --> release catalog --> packages/www (private)
```

`packages/unipty` has no concrete Backend dependency. `packages/backend` owns
metadata schema, resolver/inspection/selection, and manifest validation, not the
Core. `packages/helper-backend` depends only on public acquisition interfaces
and generates source. Each concrete Backend depends on the Core public contract;
the official packages additionally participate in conformance. `packages/www`
depends on generated documentation and an explicit catalog artifact, never on a
native Backend entry module.

The alternative, a single all-runtime package with conditional dependencies,
would make native loading, bundling, and one runtime's failure affect unrelated
routes. It is rejected.

### 2. Public Core owns observable PTY state

One configured `UniPty<TBackend>` holds one ready Backend and exposes it as the
same readonly concrete instance. A public PTY is constructed only by Core after
the Backend synchronously returns its Endpoint. Core owns:

```text
launch validation -> output views -> conversion -> bootstrap buffer
                 -> common errors -> closed state -> PTY tracking for dispose
```

An Endpoint supplies only ordered native chunks, a repeatable exit observation,
input readiness/drain, resize, and non-cascading close/terminate controls.
Internally, Core has one input state machine and one output pump per PTY. Public
stream cancellation detaches the current public view; it does not cancel the
private pump. A bounded bootstrap buffer runs only before the first view, then
the pump discards output when no view is attached. This avoids a hidden
scrollback system while preventing startup loss.

The alternative of exposing a Backend-owned public Pty object would duplicate
data conversion, lifecycle, and errors across every adapter. It is rejected.

### 3. Strict public representations with Backend-local convenience

Public output has two explicit encodings. UTF-8 output chooses native text when
available or an incremental decoder over native bytes. Bytes output accepts only
native byte chunks. Public input accepts text or bytes, with Core preserving an
available native representation. A text-native Backend can enable its own
stateful write decoder, but Core never silently decodes a byte write for it.

Write readiness is boolean and complete-value based. `false` is advisory;
`drain()` waits for readiness, and a capacity failure rejects the whole next
value. Numeric queue capacity remains an implementation decision of each
Backend. This is intentionally not a shared buffer-size setting because text,
bytes, native queues, and remote queues do not share a meaningful unit.

### 4. Acquisition is staged and caller-rooted

The public acquisition sequence remains distinct:

```text
resolve(package, from)  -> no import, one package, report locations
inspect(resolution)     -> metadata import and validation only
select(candidates)      -> explicit order or unique fallback
load + factory + ready  -> selected candidate only
new UniPty({ backend }) -> synchronous spawn thereafter
```

`resolve` uses the host runtime's native resolver from a caller-owned base;
implementation adapters must not replace it with `node_modules` traversal.
`inspect` cannot repeat resolution. Explicit candidates take priority; fallback
candidates are inferred from the consumer's dependency declarations only after
configured candidates become unavailable. Once a candidate is selected, failure
is terminal and visible rather than implicit failover.

Bundle manifests contain static metadata plus literal deferred loaders. They are
the only bundler integration seam because arbitrary dynamic imports are not
reliably collectible. The helper generates this manifest source but owns no
runtime logic or native assets.

### 5. Official Backends own their native deployment

Each official package supplies the common ready Backend contract and owns its
factory-specific options, native loading, queue policy, signal capabilities, and
physical cleanup. The routes are deliberately not normalized beyond the public
contract:

| Package                               | Substrate                        | Deployment ownership                                                |
| ------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| `@unipty/backend-node-pty`            | `node-pty`                       | package tree/native addon remains resolver-visible to deployment    |
| `@unipty/backend-bun`                 | `Bun.Terminal`                   | deployed Bun runtime supplies the PTY substrate                     |
| `@unipty/backend-deno-sigma__pty-ffi` | vendored `@sigma/pty-ffi/noinit` | npm tarball carries JavaScript closure and selected tuple libraries |

The Deno package build rejects remaining `jsr:` runtime specifiers, vendors the
needed JavaScript closure, includes target libraries in its npm tarball, and has
the factory select a package-private library path. A full FFI grant is part of
its public package acceptance run. No shared `assets[]` format can express all
three ownership models, so no asset protocol is introduced.

### 6. Conformance precedes evidence and publication

The private conformance workspace contains reusable public-surface scenarios and
a deterministic real child fixture. Tests must install/package the subjects as
a consumer would, construct a ready Backend through its public factory, then
drive its public `Pty` through Core. Adapter-local tests supplement but cannot
replace this layer.

The release chain is one-way:

```text
installed public packages
        -> full native contract pass
        -> one positive evidence record per exact tuple
        -> validate + stable aggregate release catalog
        -> route coverage gate
        -> npm publication + tagged catalog
        -> independently retryable static site deployment
```

No evidence exists for failed, cancelled, partial, or missing matrix jobs.
Aggregation validates schema, version, metadata identity, tuple, suite,
commit, and uniqueness before it produces the sole catalog. The Deno route adds
a packed-npm-consumer gate; direct JSR or workspace tests are preconditions for
debugging, not release evidence.

### 7. Static site consumes evidence without creating runtime coupling

`packages/www` builds static output for GitHub Pages. The Owner manages the
`unipty.jixoai.com` CNAME externally. Site work starts only after the catalog
schema and example release artifact exist; visual implementation uses sibling
`../openspecui` as an inspection-time reference rather than a build dependency.
The website framework and exact Pages workflow are intentionally chosen by its
implementation Agent, because they do not alter the six capability contracts.

## Delivery Dependency Graph

```text
01 workspace/tooling
  |
  +--> 02 public contract types ------------------+
  |         |                                     |
  |         +--> 03 Core state machine ----------+|
  |         +--> 04 acquisition + metadata ------+|+--> 09 contract suite
  |         |         +--> 05 manifest helper ---+|          |
  |         |                                    ||          +--> 13 native matrix
  |         +--> 06 Node Backend ----------------+|          |       |
  |         +--> 07 Bun Backend -----------------+|          |       +--> 14 evidence/catalog/release gate
  |         +--> 08 Deno Backend + npm pack -----+|          |                 |
  |                                               ||          +--> 15 docs API/content
  +--> 10 package metadata/export checks --------+|                       |
                                                    +------------------> 16 GitHub Pages site

11 test fixtures and package-install harness -----> 09
12 Deno packed-artifact verifier -----------------> 08, 09, 13
```

Tasks 03 through 08 can be assigned in parallel only after task 02 establishes
the public contract. Tasks 09 and 11 define the test seam before the three
official Backends claim completion. Tasks 13 and 14 are the publication-critical
path; task 16 is deliberately not a package-publication dependency.

## Acceptance Evidence Matrix

| Deliverable        | Required automated evidence                                                                          | Release acceptance                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Core               | unit/state-machine tests, type check, public API smoke                                               | conformance uses it only through package exports                     |
| Acquisition/helper | resolver fixtures for Node/Bun/Deno, metadata no-side-effect probe, manifest generation snapshots    | selected-candidate and bundled-manifest integration tests            |
| Node Backend       | installed-package real PTY contract on each claimed tuple                                            | at least one native passing tuple                                    |
| Bun Backend        | installed-package real PTY contract on each claimed tuple                                            | at least one native passing tuple                                    |
| Deno Backend       | npm pack/install consumer, no `jsr:` runtime scan, packaged-library existence, real FFI PTY contract | at least one packed native passing tuple                             |
| Catalog/release    | evidence schema/aggregator fixture tests and stable-order snapshot                                   | exact tagged catalog attached after all route gates                  |
| Website            | static build, catalog validation/copy fixture, no-native-import check                                | GitHub Pages deployment is Owner-visible and independently retryable |

The Owner retains final browser walkthrough and CNAME/DNS acceptance. Automated
site checks are preparation evidence only; they do not prove visual parity or
DNS propagation.

## Risks / Trade-offs

- [Native substrate semantic mismatch] -> Keep the common contract small and
  require each route to pass the same public suite on every advertised tuple.
- [Deno npm package leaves a JSR import or misses a library] -> Gate publication
  on an isolated `npm pack` consumer that scans runtime output and runs FFI PTY.
- [Bundler transforms package scope] -> Keep metadata static and side-effect
  free; require manifests to use literal deferred imports; test Bun/Deno bundle
  behavior separately.
- [A PTY produces output before the consumer subscribes] -> Test bounded
  bootstrap preservation and post-detachment discard as public observations.
- [A Backend queue overload causes corruption] -> Require whole-value rejection,
  readiness/drain semantics, and no unbounded common queue in conformance.
- [Evidence presentation drifts from release] -> The site copies one explicit,
  validated catalog unchanged and does not recompute status.
- [Website styling investigation changes over time] -> Record OpenSpecUI only as
  implementation-time reference; no build or release dependency is introduced.

## Migration Plan

There is no prior UniPty API or published package contract to migrate. Delivery
creates new workspace packages behind this Change. A failed release is not
published; a released catalog remains immutable evidence for its exact package
versions. Site deployment failure is retried from the same catalog artifact and
does not roll back or republish package artifacts.
