Type: review
Status: resolved

Part of: [UniPty v1 Wayfinder Map](../map.md)

> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai; original request:
> complete the design, then review it for overdesign): caller path, metadata
> protocol, acquisition seam, Backend extension, implementation evidence.

## Result

The v1 caller path remains intentionally small:

```ts
const backend = await createXxxBackend(options);
const pty = new UniPty({ backend }).spawn(argv, options);
```

`autoResolveUniPtyBackend()` is an optional acquisition convenience that returns
the same ready Backend. It does not change Core construction, spawn, or the
manual import-and-factory path.

## Deletion Test

| Candidate                                                                 | Decision | Reason                                                                                                                                                             |
| ------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| metadata `support.maturity`, tuple status, verified evidence              | delete   | These are release facts, not package-selection facts. A self-reported matrix duplicates the catalog and can contradict CI.                                         |
| metadata `capabilities[]`                                                 | delete   | A string summary cannot safely predict an operation and duplicates the typed per-PTY token extension.                                                              |
| metadata asset strategy, module URL, asset base URL                       | delete   | These are build observations with no stable meaning after bundling.                                                                                                |
| public or helper-internal native asset report                             | delete   | Real Bun/esbuild/Deno probes expose incompatible ownership models; even an internal schema would preserve a concept with no consumer or stable fields.             |
| JSR-only/dual-registry Deno Backend distribution                          | delete   | The official route is one npm package; registry-specific installation would add a second release surface and still not solve nested `jsr:` imports in npm modules. |
| candidate-level loader outside a manifest                                 | delete   | It creates a second acquisition path. A manifest is the one explicit place where static metadata and a bundler-visible loader belong together.                     |
| `inspect(packageName)` repeating resolve                                  | delete   | It duplicates work and confuses package absence with absent metadata. Inspect takes `BackendResolvedReport`.                                                       |
| `backend.id`, factory export, Core protocol, targets, optional provenance | retain   | Together they are the irreducible static declaration for identity, deterministic factory lookup, hard compatibility, prefiltering, and human display.              |
| `resolve -> inspect -> select -> import -> factory -> ready`              | retain   | Each effect boundary has a different observable guarantee and must remain independently testable.                                                                  |
| explicit Bundle Manifest and `@unipty/helper-backend`                     | retain   | Bundlers cannot reliably collect arbitrary runtime specifiers; the manifest is a real deployment seam, while the helper keeps generation outside the runtime.      |
| self-contained Deno Backend npm artifact                                  | retain   | Vendored `noinit` JavaScript and tuple libraries make the promised npm-only route executable without exposing an asset protocol to Core or helper.                 |
| `pty.capability(token)`                                                   | retain   | `unipty.backend` exposes shared Backend state; token lookup is the only small, typed seam for a particular PTY's Backend extension without widening common `Pty`.  |

## Resulting Boundaries

```text
package metadata       identity + factory + protocol + targets
        |
resolve                no import
        |
inspect(resolution)    metadata import only
        |
select                 explicit order or unique fallback
        |
load -> factory -> ready
        |
new UniPty({ backend }) -> synchronous spawn

catalog / CI           verified evidence and official presentation only
helper                 generated manifest only
Backend package        private native materialization and deployment recipe
```

## Module Depth Audit

| Module/interface                        | Decision                     | Deletion result                                                                                                                               |
| --------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Core `UniPty` + public `Pty`            | retain                       | Deletion repeats stream conversion, lifecycle, buffering, backpressure, errors, and native differences in every consumer.                     |
| Core-private Backend Endpoint seam      | retain                       | Node, Bun, and Deno are three real adapters; the private seam keeps their variation out of the public PTY interface.                          |
| `@unipty/backend` acquisition interface | retain                       | Deletion repeats caller-rooted resolution, metadata validation, deterministic selection, and effect staging in every convenience consumer.    |
| Bundle Manifest + manifest-only helper  | retain                       | Arbitrary dynamic imports are not bundler-visible; deletion makes each bundled consumer hand-maintain the same static metadata/loader module. |
| Official Catalog artifact               | retain, not a runtime module | Deletion makes release evidence ephemeral or forces the website to become an evidence authority. It adds no runtime interface.                |
| Native asset report/interface           | delete                       | Its three adapters do not share semantics; keeping the seam would expose implementation detail without leverage.                              |

The remaining modules are deep relative to their interfaces: each hides behavior
that otherwise reappears across callers or adapters. Native asset layout stays an
internal Backend implementation seam and is verified only through the packed
public package interface.

## Remaining Evidence

Catalog/CI ownership is now specified in issue 12 as positive per-job evidence,
deterministic release aggregation, and unchanged static-site consumption. Real
Bun/esbuild/Deno probes in issue 13 closed native-asset architecture by deleting
the report abstraction and assigning materialization to each Backend package and
host deployment. What remains is implementation acceptance: packed official
packages, the native contract matrix, release catalog attachment, and unchanged
site consumption. In particular, the Deno route must pass from its npm tarball;
direct workspace or JSR execution is insufficient.
