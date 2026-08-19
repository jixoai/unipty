> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): dependency-ordered
> implementation; public-contract testing; release evidence; Owner acceptance.
>
> Execution law: tasks in this file are delegated implementation work. Completing
> planning artifacts does not authorize an Agent to claim `apply` completion,
> package publication, visual acceptance, or DNS acceptance.

## 1. Workspace and Public Contract Foundation

- [ ] 1.1 Create the pnpm workspace topology for `unipty`, `@unipty/backend`, `@unipty/helper-backend`, three official Backend packages, private conformance tooling, and `packages/www`; add package ownership and no-cross-dependency checks. (depends: none; verify: workspace install and dependency-graph check pass)
- [ ] 1.2 Configure cross-runtime build, type-check, formatter, unit-test, and package-pack commands without making an official Backend a Core dependency. (depends: 1.1; verify: every command has an executable empty/smoke target)
- [ ] 1.3 Define and document the public Core types: UniPty, Pty, structured argv launch, terminal geometry, streams, errors, Process Exit Result, Backend, Endpoint, and capability token types. (depends: 1.1; verify: declaration type tests compile without `any` escape hatches)
- [ ] 1.4 Define the public metadata, resolver report, warning, manifest, and initialization-error types used by `@unipty/backend`. (depends: 1.3; verify: discriminated-union exhaustiveness tests compile)
- [ ] 1.5 Add test-only deterministic child programs and shared runtime-neutral fixtures that can exercise output, input, resize, exit, and long-running PTY behaviour. (depends: 1.1; verify: fixtures run deterministically outside a PTY and report their expected markers)
- [ ] 1.6 Add package-export and API-surface tests that reject undeclared public subpaths, accidental Core-to-Backend dependencies, and public type drift. (depends: 1.2, 1.3, 1.4; verify: negative fixture imports fail as expected)

## 2. Core and Backend Seam

- [ ] 2.1 Implement the ready Backend and Core-private Endpoint seam, including synchronous per-PTY spawn, explicitly tagged native chunks, repeatable exit observation, write readiness/drain, resize, non-cascading close/terminate, and Backend disposal hook. (depends: 1.3; verify: seam unit tests cover each control without constructing a public Pty in an adapter)
- [ ] 2.2 Implement configured `UniPty<TBackend>` construction, readonly concrete `backend` exposure, PTY tracking, and synchronous spawn failure propagation. (depends: 2.1; verify: generic inference and multi-spawn type/runtime tests pass)
- [ ] 2.3 Implement structured argv validation and independent initial geometry resolution, including explicit dimensions, host environment, trusted TTY, and `80 x 24` fallback. (depends: 2.2; verify: table-driven invalid, partial, TTY, and non-TTY cases pass)
- [ ] 2.4 Implement the private output pump, bounded bootstrap buffer, one-active-stream ownership, incremental UTF-8 decode, native-byte fidelity rules, and detached-view discard behaviour. (depends: 2.2; verify: chunk-boundary, startup-output, cancellation, second-stream, and text-only negative tests pass)
- [ ] 2.5 Implement public write representation selection, Backend write-decoder routing, boolean Write Readiness, `drain()`, and whole-value bounded saturation. (depends: 2.2; verify: native text/native bytes/decoder split UTF-8/backpressure/no-partial-write tests pass)
- [ ] 2.6 Implement resize validation, common error construction, exit observation, idempotent non-cascading close/terminate, and graceful `UniPty.dispose()`. (depends: 2.2; verify: lifecycle ordering, post-close rejection, existing-exit, and disposal-waits tests pass)
- [ ] 2.7 Implement Backend capability-token storage and object-identity lookup without string fallback. (depends: 2.1, 2.2; verify: same-instance, duplicate-package-token, and unsupported-operation tests pass)
- [ ] 2.8 Run the Core unit/type suite through only public Core exports and record the results as implementation evidence, not native support evidence. (depends: 2.3, 2.4, 2.5, 2.6, 2.7; verify: type check, unit tests, coverage thresholds, and public export smoke all pass)

## 3. Backend Acquisition and Manifest Generation

- [ ] 3.1 Implement Metadata Protocol validation for package identity, Backend/factory identity, Core protocol, targets, and optional provenance; reject all forbidden metadata claims. (depends: 1.4; verify: valid/invalid schema fixtures and side-effect-free metadata import tests pass)
- [ ] 3.2 Implement runtime-native, caller-rooted single-package resolution adapters for Node, Bun, and Deno without filesystem scanning. (depends: 1.4; verify: each runtime resolves a fixture from explicit `from` and reports missing/invalid packages distinctly)
- [ ] 3.3 Implement metadata-only inspection and target/protocol compatibility evaluation without loading a Backend entry module or factory. (depends: 3.1, 3.2; verify: entry-load counters remain zero during inspection)
- [ ] 3.4 Implement AutoResolve runtime analysis, explicit candidate ordering, structured warning delivery, dependency-derived fallback, unique-fallback ambiguity, and terminal selected-initialization errors. (depends: 3.2, 3.3; verify: ordered, unavailable, ambiguous, no-console-pure-stage, and selected-failure fixtures pass)
- [ ] 3.5 Implement immutable `defineUniPtyBackendManifest()` validation and manifest-only AutoResolve selection. (depends: 3.1, 3.4; verify: empty, duplicate, mismatched, non-callable, non-selected-loader, and input-mutation fixtures pass)
- [ ] 3.6 Implement `@unipty/helper-backend` manifest source generation API and CLI with explicit candidates, output-mode exclusivity, overwrite protection, stdout/stderr separation, and no Backend initialization. (depends: 3.5; verify: CLI/programmatic golden-source and negative option tests pass)
- [ ] 3.7 Run Node, Bun, and Deno metadata/bundle probes against the implementation packages, including static metadata evaluation and deferred loader execution. (depends: 3.3, 3.5, 3.6; verify: metadata import is side-effect-free and only the selected deferred loader changes its load counter)

## 4. Public Conformance Harness

- [ ] 4.1 Implement the installed-public-package conformance harness that acquires a ready Backend through its factory, constructs UniPty, and drives only public Pty operations. (depends: 1.3, 1.5; verify: a deliberately invalid adapter is rejected without accessing Endpoint internals)
- [ ] 4.2 Codify Core profile scenarios for launch, geometry, stream representations, incremental decoding, stream detachment, bootstrap output, input readiness, drain, saturation, resize, lifecycle, disposal, errors, and capabilities. (depends: 2.8, 4.1; verify: each requirement in `runtime-neutral-pty` and `pty-backend-seam` maps to at least one named scenario)
- [ ] 4.3 Codify acquisition and manifest conformance scenarios for resolve, inspect, AutoResolve, warnings, selected initialization failure, metadata exports, manifest validation, and helper generation. (depends: 3.7, 4.1; verify: each `backend-acquisition` requirement maps to positive and relevant negative coverage)
- [ ] 4.4 Add a conformance reporting format that records suite identity/version, package identities, runtime version, normalized tuple, tested commit, and report reference without asserting verification status itself. (depends: 4.1; verify: report schema fixtures reject absent or malformed required identity fields)
- [ ] 4.5 Add a requirement-to-scenario traceability check for all six Change specs, failing when an automated requirement has no named conformance or package-level acceptance task. (depends: 4.2, 4.3, 4.4; verify: deliberate traceability gaps fail the check)

## 5. Official Backend Packages

- [ ] 5.1 Implement `@unipty/backend-node-pty` package exports, metadata, async factory, ready Backend, and Node `node-pty` Endpoint adapter. (depends: 2.1, 3.1; verify: local adapter tests and public factory smoke run on the declared Node target)
- [ ] 5.2 Add Node route package-install and real PTY tests, including write/read, resize, exit, close, terminate, unsupported handling, and native asset deployment arrangement. (depends: 5.1, 4.2; verify: installed package passes the full public conformance profile on the test tuple)
- [ ] 5.3 Implement `@unipty/backend-bun` package exports, metadata, async factory, ready Backend, and Bun `Bun.Terminal` Endpoint adapter. (depends: 2.1, 3.1; verify: local adapter tests and public factory smoke run on the declared Bun target)
- [ ] 5.4 Add Bun route package-install and real PTY tests, including native text/bytes adaptation, resize, exit, close, terminate, and declared unsupported handling. (depends: 5.3, 4.2; verify: installed package passes the full public conformance profile on the test tuple)
- [ ] 5.5 Implement the `@unipty/backend-deno-sigma__pty-ffi` build that vendors the `noinit` JavaScript closure and target libraries into its npm package with no runtime `jsr:` specifier. (depends: 1.2, 2.1, 3.1; verify: packed tarball inspection finds required libraries and rejects runtime `jsr:` imports)
- [ ] 5.6 Implement the Deno factory and Endpoint adapter with package-private library selection, explicit noinit initialization, required FFI permission documentation, and no default-download/cache dependency. (depends: 5.5; verify: isolated local package consumer can create a ready Backend with its packaged library)
- [ ] 5.7 Add Deno route real PTY tests over the packed npm artifact, including explicit FFI permission, structured launch, output, resize, exit, close, and terminate. (depends: 5.6, 4.2; verify: packed consumer passes the full public conformance profile on the test tuple)
- [ ] 5.8 Verify that each official package exposes only its documented public entries and that metadata target declarations/provenance match the actual route substrate without claiming verified support. (depends: 5.2, 5.4, 5.7; verify: package export, metadata-schema, and provenance fixtures pass)

## 6. Native Package Acceptance and Support Claims

- [ ] 6.1 Run the complete conformance suite against installed Node, Bun, and packed Deno packages rather than workspace source or adapter internals. (depends: 4.5, 5.2, 5.4, 5.7; verify: three exact tuple reports are produced from public package surfaces)
- [ ] 6.2 Add host-bundler acceptance fixtures for the documented external-package deployment arrangement and explicitly reject a shared native asset report, copier, downloader, or `./unipty.build` protocol. (depends: 5.2, 5.4, 5.7; verify: Node/Bun/Deno deployment fixtures preserve each Backend's private asset ownership)
- [ ] 6.3 Add a release-preflight rule requiring one passing native tuple for every official route and prohibiting a verified claim from metadata, package installation, module load, or partial tests. (depends: 6.1; verify: missing-route and false-claim fixtures fail preflight)
- [ ] 6.4 Audit common v1 scope against the public packages: no persistence/reconnect guarantee, no second plugin registry, no implicit shell execution, no hidden Backend fallback, and no generic signal API. (depends: 6.1, 6.2; verify: public API and behavioural negative tests pass)

## 7. Verification Evidence, Catalog, and Release Automation

- [ ] 7.1 Implement the positive Verification Evidence schema and writer, gated on a complete public conformance pass and exact package/runtime/platform/suite/commit identity. (depends: 4.4, 6.1; verify: successful jobs emit one valid record and failed/skipped/partial fixtures emit none)
- [ ] 7.2 Implement deterministic catalog aggregation with metadata snapshot validation, tuple normalization, duplicate/contradiction rejection, stable sorting, and exact three-state presentation derivation. (depends: 7.1; verify: aggregator schema, ordering, invalid-record, and presentation fixtures pass)
- [ ] 7.3 Configure native CI matrix jobs to install public packages, run the appropriate runtime suite, emit evidence only after full success, and include the Deno packed-artifact verifier. (depends: 6.1, 7.1; verify: CI dry-run/workflow validation covers Node, Bun, and Deno paths without emitting evidence before success)
- [ ] 7.4 Configure the tagged release gate to require all three official-route records, aggregate one catalog, publish packages from the tested commit, and attach the catalog to the same release. (depends: 6.3, 7.2, 7.3; verify: release workflow fixture fails for a missing route or wrong commit and passes with all exact records)
- [ ] 7.5 Document release evidence handling so failures remain CI diagnostics rather than permanent unsupported catalog claims. (depends: 7.2; verify: documentation/catalog test has no fourth failure support state)

## 8. Documentation Site and GitHub Pages

- [ ] 8.1 At implementation time, inspect the sibling `../openspecui` official site and record the chosen site framework, styling approach, and GitHub Pages workflow in the website implementation notes; do not introduce it as a source dependency. (depends: 1.1; verify: note identifies the inspected revision or date and the dependency graph remains unchanged)
- [ ] 8.2 Implement static `packages/www` documentation for Core usage, manual/AutoResolve acquisition, official routes, metadata/manifest examples, and the limits of browser-local PTY. (depends: 8.1, 2.8, 3.7, 5.8; verify: static build passes and browser output contains no native Backend entry import)
- [ ] 8.3 Implement release-catalog validation and unchanged copy into site output, then render exact `verified`, `declared-unverified`, and `not-targeted` states with their evidence dimensions. (depends: 7.2, 8.2; verify: fixture catalogs prove no history merge, version widening, or browser-side evidence recomputation)
- [ ] 8.4 Configure a GitHub Pages deployment workflow that consumes an explicit release/tag catalog artifact and remains retryable without package publication. (depends: 7.4, 8.3; verify: workflow validation and failed-deploy retry fixture leave package publication untouched)
- [ ] 8.5 Run automated static-site checks for build output, links, catalog rendering, responsive layout, and absence of browser PTY/resolver imports. (depends: 8.2, 8.3, 8.4; verify: all automated checks pass; this is preparation evidence, not visual acceptance)

## 9. Final Acceptance and Handoff

- [ ] 9.1 Run the complete workspace formatter, type checks, unit suites, public-package conformance suites, package-pack/install checks, native matrix preflight, catalog aggregation, and static-site build from a clean checkout. (depends: 2.8, 3.7, 6.4, 7.5, 8.5; verify: command log identifies exact runtime versions, tuples, package versions, and tested commit)
- [ ] 9.2 Perform a Change-to-implementation traceability audit: every OpenSpec requirement has implementation evidence, an automated test or explicit Owner acceptance, and no out-of-scope parser/persistence/asset-report feature was added. (depends: 9.1; verify: audit links requirements to code, tests, evidence, and any Owner-only boundary)
- [ ] 9.3 Owner accepts the release artifact: inspect the exact catalog attachment, npm package contents, and each required native tuple claim before publication. (depends: 7.4, 9.2; Owner-only acceptance; verify: Owner records approve/reject decision)
- [ ] 9.4 Owner accepts the deployed site: inspect the GitHub Pages result, visual direction against the current OpenSpecUI reference, and externally configured `unipty.jixoai.com` CNAME/DNS mapping. (depends: 8.5, 9.2; Owner-only acceptance; verify: Owner records approve/reject decision)
