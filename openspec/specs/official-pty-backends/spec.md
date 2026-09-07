# official-pty-backends Specification

## Purpose

Deliver the Node, Bun, and Deno PTY routes together as official packages without
misrepresenting their different substrates, runtime limits, or native assets.

## Requirements

### Requirement: First-phase official Backend set

The official route set SHALL include `@unipty/backend-node-pty`,
`@unipty/backend-zigpty`, `@unipty/backend-bun`, and
`@unipty/backend-deno-sigma__pty-ffi`. The first release phase delivered the
Node, Bun, and Deno routes together; the second phase (2026-09-07) added the
zigpty Node route. Route identity is the substrate, never the runtime, so one
runtime MAY carry multiple official routes. Each package SHALL expose its
declared asynchronous `createXxxBackend(options)` factory and the official
Metadata Protocol. The absence of public conformance evidence for a tuple
SHALL not defer implementation of any required route.

#### Scenario: Each official package is independently acquirable

- **WHEN** an application imports any one official Backend on its declared
  runtime and target
- **THEN** it can acquire a ready Backend through that package's documented
  factory before constructing UniPty

#### Scenario: A runtime may carry more than one official route

- **WHEN** the official set contains two Node-route packages (`node-pty` and
  `zigpty`)
- **THEN** each stays independently acquirable, independently provenanced, and
  independently gated by release evidence — one route's pass never stands in
  for the other

### Requirement: Substrate provenance remains explicit

The Node Backends SHALL adapt third-party `node-pty` and third-party
`zigpty` respectively; the Bun Backend SHALL adapt runtime-native
`Bun.Terminal`; and the Deno Backend SHALL adapt third-party `@sigma/pty-ffi`
over Rust `portable-pty`. Package names, metadata provenance, and
documentation SHALL preserve those distinctions and SHALL not represent a
substrate as a different runtime's native API.

#### Scenario: Node route is not described as a Node runtime API

- **WHEN** documentation or metadata identifies a Node official route
- **THEN** it names its substrate (`node-pty` or `zigpty`) rather than
  claiming a native Node PTY API

### Requirement: Deno Backend is a self-contained npm package

`@unipty/backend-deno-sigma__pty-ffi` SHALL be published as an npm package whose
runtime output contains no unresolved `jsr:` import. Its build SHALL vendor the
required `noinit` JavaScript closure and include the targeted dynamic libraries
in the npm artifact. The factory SHALL privately select the applicable packaged
library and explicitly initialize it; package asset layout SHALL not become a
Core, metadata, resolver, manifest, or helper contract.

#### Scenario: Packed Deno package initializes without JSR registry setup

- **WHEN** an isolated Deno consumer installs the official packed npm artifact
  with the required FFI permission
- **THEN** the Backend factory initializes its packaged library without a
  runtime JSR package import or registry configuration

### Requirement: Native deployment remains Backend-owned

Each official Backend SHALL publish its own deployment instructions and SHALL
retain responsibility for its native substrate materialization. Core, metadata,
AutoResolve, Bundle Manifest, and helper SHALL NOT provide a shared native asset
schema, generic asset copier, downloader, relocation rule, or `./unipty.build`
protocol. A host JavaScript bundle that would detach package-owned native assets
SHALL use the owning Backend's documented deployment arrangement.

#### Scenario: Native packaging does not alter Core selection

- **WHEN** a host deploys an official Backend with its required native resources
- **THEN** Core and AutoResolve select the Backend through the ordinary ready
  Backend path without receiving asset paths or bundler directives

### Requirement: Verified support is evidence-gated

An official package SHALL claim a runtime and platform tuple as verified only
when exact public conformance evidence exists for its released package and Core
versions. Metadata target declarations SHALL only prefilter selection and SHALL
not imply native loadability, readiness, or verified support.

#### Scenario: Declared but untested tuple remains unverified

- **WHEN** an official Backend's target declaration includes a tuple with no
  exact public conformance record
- **THEN** documentation presents it as declared-unverified rather than verified

### Requirement: Official zigpty Backend route

The official set SHALL include `@unipty/backend-zigpty` (route identity
`zigpty`, runtime target `node`) alongside the first-phase routes. The
package SHALL expose the asynchronous `createZigptyBackend(options)` factory
and the official Metadata Protocol, SHALL declare third-party `zigpty`
provenance, and SHALL pin an exact substrate version.

#### Scenario: Native gate rejects the pipe fallback

- **WHEN** the zigpty substrate reports no native addon for the host tuple
- **THEN** `createZigptyBackend()` readiness fails with `unsupported` and no
  pipe-based pseudo-PTY is ever spawned

#### Scenario: Transport close never terminates the child

- **WHEN** an Endpoint `close()` is invoked while the child is alive
- **THEN** the adapter defers the substrate transport teardown until the
  exit observation settles, so close does not cascade into termination

#### Scenario: Text-only input with explicit byte convenience

- **WHEN** a caller writes bytes to a strict zigpty Endpoint
- **THEN** the write fails with `unsupported`, and only a Backend-owned
  `writeDecode` option accepts byte input by decoding it

#### Scenario: A saturated byte value never advances decoder state

- **WHEN** a byte value is rejected by the bounded admission queue while a
  split multibyte sequence is pending in the writeDecode decoder
- **THEN** retrying the same bytes after drain decodes them exactly as first
  attempted — rejection is whole-value, including decoder state

#### Scenario: Windows fails closed without usable flow control

- **WHEN** the substrate's public output flow control is inert on a platform
  (pause/resume are no-ops on Windows in 0.2.1)
- **THEN** the factory refuses readiness with `unsupported` on that platform
  and metadata target declarations exclude it, rather than running an
  unbounded output queue
