## Purpose

Deliver the Node, Bun, and Deno PTY routes together as official packages without
misrepresenting their different substrates, runtime limits, or native assets.

## ADDED Requirements

### Requirement: First-phase official Backend set

The first release phase SHALL include `@unipty/backend-node-pty`,
`@unipty/backend-bun`, and `@unipty/backend-deno-sigma__pty-ffi`. Each package
SHALL expose its declared asynchronous `createXxxBackend(options)` factory and
the official Metadata Protocol. The absence of public conformance evidence for a
tuple SHALL not defer implementation of any of the three required routes.

#### Scenario: Each official package is independently acquirable

- **WHEN** an application imports any one official Backend on its declared
  runtime and target
- **THEN** it can acquire a ready Backend through that package's documented
  factory before constructing UniPty

### Requirement: Substrate provenance remains explicit

The Node Backend SHALL adapt third-party `node-pty`; the Bun Backend SHALL adapt
runtime-native `Bun.Terminal`; and the Deno Backend SHALL adapt third-party
`@sigma/pty-ffi` over Rust `portable-pty`. Package names, metadata provenance,
and documentation SHALL preserve those distinctions and SHALL not represent a
substrate as a different runtime's native API.

#### Scenario: Node route is not described as a Node runtime API

- **WHEN** documentation or metadata identifies the Node official route
- **THEN** it names `node-pty` as the substrate rather than claiming a native
  Node PTY API

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
