> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): v1 motivation;
> capability contract; delivery scope; implementation impact.
>
> Original request (2026-08-17 Asia/Shanghai): define and implement a
> runtime-neutral PTY abstraction for Node, Bun, and Deno with developer-
> selectable Backends. Planning direction (2026-08-19 Asia/Shanghai): produce
> OpenSpec planning only; implementation is delegated to later Agents.

## Why

Node, Bun, and Deno expose incompatible PTY substrates, installation models,
I/O representation, lifecycle behaviour, and native deployment constraints.
Consumers currently repeat that runtime-specific work or couple application code
to one substrate. The completed UniPty v1 architecture establishes a common
contract and exact evidence boundary; this Change turns it into an implementable
and independently verifiable delivery plan.

## What Changes

- Add the runtime-neutral `unipty` Core public contract: explicit structured
  argv launch, streams, input readiness, resize, independent exit observation,
  lifecycle, errors, and disposal.
- Add the ready Backend seam, so Core owns common PTY behaviour while concrete
  Backends own their native substrate, readiness, and physical teardown.
- Add `@unipty/backend` acquisition: metadata inspection, caller-rooted
  resolution, deterministic selection, and explicit bundle manifests; add
  `@unipty/helper-backend` only for manifest-source generation.
- Add and release the first-phase official Backends together:
  `@unipty/backend-node-pty`, `@unipty/backend-bun`, and
  `@unipty/backend-deno-sigma__pty-ffi`.
- Add one installed-public-package conformance suite, positive release evidence,
  deterministic compatibility catalog aggregation, and a static website that
  displays the release artifact without affecting runtime selection.
- Add `packages/www` as a static GitHub Pages site. The Owner owns the CNAME
  mapping; its implementation-time visual reference is the sibling OpenSpecUI
  official site, not a source dependency.

## Capabilities

### New Capabilities

- `runtime-neutral-pty`: Public PTY launch, stream, input, geometry, lifecycle,
  error, and disposal behaviour independent of a concrete runtime.
- `pty-backend-seam`: Ready Backend and Core-private Endpoint contract that
  isolates native PTY adapters and Backend-specific capabilities.
- `backend-acquisition`: Metadata Protocol, caller-rooted resolve/inspect/
  select/initialize flow, explicit bundle manifest, and helper generator.
- `official-pty-backends`: Node `node-pty`, Bun `Bun.Terminal`, and self-
  contained Deno `@sigma/pty-ffi` official Backend packages.
- `pty-conformance-evidence`: Installed-public-package contract suite, positive
  verification evidence, release catalog aggregation, and route release gates.
- `documentation-site`: Private static official website, immutable catalog
  consumption, and GitHub Pages deployment boundary.

### Modified Capabilities

None. The OpenSpec root has no existing UniPty capability specifications.

## Impact

- Adds the pnpm workspace package graph for Core, acquisition, helper, three
  official Backends, private conformance tooling, and `packages/www`.
- Establishes new public TypeScript contracts and package exports; no prior
  UniPty API exists, so no compatibility shim or migration is required.
- Introduces runtime-specific native dependencies and release preparation for
  Node, Bun, and Deno, while keeping their deployment assets out of Core.
- Requires CI runners for native conformance, release catalog generation, npm
  packed-artifact verification, and independently retryable GitHub Pages deploy.
- Explicitly excludes Core persistence/reconnection, a second plugin registry,
  implicit shell evaluation, shell parser publication, and browser-local PTY.
