# Compatibility Catalog And CI

Type: architecture  
Status: resolved

> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai; original request:
> complete the v1 design and simplify it after review): evidence production;
> release aggregation; documentation presentation; freshness boundary.

Part of: [UniPty v1 Wayfinder Map](../map.md)

## Decision

The Official Catalog is a release artifact, not a runtime service, npm package,
or manually maintained support matrix.

```text
public contract suite
        |
        | full pass only
        v
Verification Evidence artifacts (one native tuple per job)
        |
        | validate + aggregate + stable sort
        v
release catalog JSON ----------------------+
        |                                  |
        | release gate                     | explicit tag/artifact
        v                                  v
official package publication          packages/www static build
                                           |
                                           v
                                      evidence display

Core / resolver / AutoResolve <------ no dependency ------> catalog
```

## Why This Shape

The earlier design correctly removed support status from Backend Metadata, but
left open how CI evidence becomes durable website data. The minimum complete
answer is one positive record format and one deterministic aggregator.

- Metadata remains the package's static declaration.
- Verification Evidence records one observed full-suite pass.
- The Official Catalog snapshots the release declaration and its evidence.
- The website presents the catalog without becoming an evidence authority.

No catalog daemon, runtime lookup, community registry, compatibility scoring,
or second package protocol is needed for v1.

## Catalog Shape

One versioned JSON catalog contains:

```text
Catalog
├── schema
├── release
│   ├── tag
│   ├── commit
│   └── generatedAt
└── backends[]
    ├── validated metadata snapshot
    │   ├── package name + version
    │   ├── Backend id
    │   ├── Core protocol majors
    │   └── target declarations
    └── verifications[]
        ├── Core package version + protocol major
        ├── runtime name + exact version
        ├── OS + arch + optional libc
        ├── suite identity + version
        ├── tested commit
        ├── verifiedAt
        └── optional stable report reference
```

The catalog intentionally snapshots only the validated declaration fields
needed to interpret historical evidence. This is not the generated runtime
Bundle Manifest rule: a release catalog is immutable documentation evidence,
whereas a Bundle Manifest must load the currently installed metadata and avoid
drift during runtime selection.

Catalog membership denotes an official release. V1 therefore has no redundant
`official: true` field and no maturity taxonomy. Community Backends can run the
public conformance suite, but inclusion in the repository-owned catalog is a
separate future governance decision.

## Evidence Law

Verification Evidence is emitted only when the full public contract suite
passes against the installed public package surface. It is exact, positive
evidence:

- no record is emitted for failed, skipped, cancelled, or partial jobs;
- one runtime version never implies a runtime range;
- one OS/arch/libc tuple never implies another tuple;
- one Backend package version never proves the next version;
- elapsed time alone does not invalidate an otherwise exact historical record;
- Linux native evidence must name `glibc` or `musl`; other platforms omit libc
  unless that dimension changes compatibility.

The aggregator rejects malformed records, package/metadata mismatch,
wrong-suite versions, wrong tested commits, duplicate tuple identities, and
contradictory records. Stable sorting makes equivalent input produce equivalent
catalog structure apart from explicit time fields.

## Presentation Law

The site derives exactly three states by joining a release metadata snapshot
with exact evidence:

| State                 | Meaning                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `verified`            | The released Backend version has matching full-suite evidence for this exact runtime and platform tuple. |
| `declared-unverified` | The Backend target declaration matches, but no exact evidence exists.                                    |
| `not-targeted`        | The release target declaration excludes the tuple.                                                       |

Failure is not a fourth permanent state. A CI failure can be caused by the
Backend, runner, toolchain, or infrastructure; publishing it as `unsupported`
would turn one observation into a stronger product claim than the evidence
permits. Detailed failures stay in CI reports until a separate negative-support
policy is designed.

The website may label the first state “Verified”. It must display the exact
Backend version, runtime version, platform tuple, suite version, and verification
time close to that label. It may not collapse evidence into “Node supported” or
“Windows supported” without the corresponding dimensions.

## CI And Release Procedure

```text
1. prepare release commit and package versions
2. run native matrix jobs through public package exports
3. emit evidence from full passes only
4. aggregate and validate the release catalog
5. require one native passing tuple for each first-phase route
6. publish packages from the tested release commit
7. attach the catalog to the same tagged release
8. independently deploy the site from that explicit release artifact
```

The first-phase route gate covers:

- `@unipty/backend-node-pty`
- `@unipty/backend-bun`
- `@unipty/backend-deno-sigma__pty-ffi`

At least one native tuple for each route must pass before publication. This gate
proves that all three required runtime routes exist and satisfy the common
contract somewhere; it does not advertise untested OS or architecture tuples.

The site workflow accepts an explicit release tag or catalog artifact. It
validates the catalog and copies it unchanged into the static output. It does
not install native Backend packages, rerun PTY probes in a browser, merge old
records, infer missing tuples, or query a runtime service. A failed site deploy
can be retried independently after package release.

## Rejected Expansion

- Backend Metadata support matrices or self-reported `verified` fields.
- A network catalog dependency in Core or `@unipty/backend`.
- A new `@unipty/catalog` runtime package.
- A manually ordered preference score derived from evidence.
- Automatic range claims from exact runtime results.
- Permanent `unsupported` status derived from failed or missing CI.
- Separate official and maturity booleans in every evidence record.
- Website-side evidence merging or native package inspection.

## Remaining Evidence

This decision fixes the artifact and ownership contract; it does not implement
the CI workflow. Release acceptance still requires the real conformance harness,
native runners, catalog aggregation, release attachment, and static-site
consumption to execute successfully.
