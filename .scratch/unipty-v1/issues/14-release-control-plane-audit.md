# Release Control-plane Audit

> Original request (2026-08-20 Asia/Shanghai): independently verify the
> repository's next highest-value goal, especially Git state, OpenSpec, release
> automation, CI evidence, and GitHub Pages. The investigation was read-only;
> this Markdown file is its sole output. The claims below cite the owning
> repository, registry, or GitHub control plane.

## Scope and snapshot

- Audited repository: `jixoai/unipty`, branch `main`.
- Snapshot commit: `cb18c9b` (`chore(release): bump publishable packages to
0.1.1`), observed 2026-08-20 Asia/Shanghai.
- No source, workflow, package, or configuration file was modified by this
  audit. This file is the sole research artifact; the pre-existing worktree
  changes were left untouched.

## Findings

### 1. A first publication has already occurred, but it has no matching GitHub release/tag

The npm registry reports version `0.1.0` for all six publishable packages:
`unipty`, `@unipty/backend`, the three official Backend packages, and
`@unipty/helper-backend`. Their publish timestamps are 2026-08-20
06:44--06:45 UTC. The checked-out project has then advanced to `0.1.1` in all
seven package manifests (including private conformance tooling).

At the audit snapshot, `git tag --list`, `git ls-remote --tags origin`, and
`gh release list` produced no tag or GitHub Release. Therefore `0.1.0` was an
already-public registry release without the architecture's required immutable
release catalog attachment, and cannot be treated as a completed v1 release
chain.

Sources:

- [Current manifest version bump](../../../packages/unipty/package.json) and the
  same package topology in the root [package scripts](../../../package.json).
- [npm: unipty versions](https://www.npmjs.com/package/unipty?activeTab=versions),
  [npm: @unipty/backend](https://www.npmjs.com/package/@unipty/backend?activeTab=versions),
  and the corresponding scoped route packages.
- [Release workflow](../../../.github/workflows/release.yml) requires a `v*` tag,
  aggregates evidence, publishes packages, then attaches `catalog.json`.

### 2. The current mainline cannot establish release evidence

The last local full verification log is explicitly for commit `0b57425`, not
for the current release candidate. It lists local green results, but it is not
evidence for later commits or newly bumped package versions.

GitHub Actions has no successful CI run for `0b57425`; all observed `main`
pushes through `cb18c9b` fail. The latest run
[32348214878](https://github.com/jixoai/unipty/actions/runs/32348214878) failed
before `conformance-matrix`, so no new installed-package evidence artifacts
exist for its commit.

The failure is deterministic workflow topology, not native PTY behaviour:

1. `quality` invokes `pnpm check:arch`, whose root script invokes `bun`, but
   the `quality` job installs Node only. The job fails with `bun: not found`.
2. Each `bun-suite` runner installs Bun but not Deno, then invokes root
   `pnpm build`. The recursive build includes the Deno route, whose build
   invokes `deno`; it fails with `deno: command not found` before Bun adapter
   tests run.
3. `conformance-matrix` depends on both jobs, so it is skipped; the release
   workflow's exact-commit collection cannot obtain the mandatory route
   evidence.

Sources:

- [Recorded local verification](../../../openspec/changes/archive/2026-08-20-add-unipty-v1-pty-platform/verification.md)
  identifies `0b57425` and its command results.
- [CI workflow](../../../.github/workflows/ci.yml) lines 13-30, 32-51, and 74-131
  establish the missing-runtime topology and dependency chain.
- [Latest failed CI run](https://github.com/jixoai/unipty/actions/runs/32348214878)
  and its failed job logs: quality (`bun: not found`), Bun matrices (`deno: not
found`), skipped installed-public-package conformance.
- The evidence requirement mandates complete installed public-contract success
  before a record is emitted: [spec](../../../openspec/specs/pty-conformance-evidence/spec.md).

### 3. GitHub Pages is enabled but does not deploy `packages/www`

The repository Pages API reports an active public Pages site at
`https://jixoai.github.io/unipty/`, backed by the GitHub-managed
`pages-build-deployment` workflow. Its only successful deployment uses commit
`6a4cc2f`. The run's build log shows `actions/jekyll-build-pages` with
`source: .`, which renders repository-root Markdown (including `AGENTS.md`,
`CONTEXT.md`, and archived OpenSpec files), rather than building and uploading
`packages/www/dist`.

This is independent from `.github/workflows/deploy-www.yml`: that intended
workflow is manual, requires a release tag, downloads a release-attached
catalog, builds `packages/www`, and uploads its `dist`. No such workflow run
or release asset exists. The Pages API has `cname: null`; `unipty.jixoai.com`
was not verifiably mapped during this audit.

This is both a release-contract breach and a public-information exposure risk:
the official Pages surface is currently controlled by an unintended repository
root Jekyll pipeline, while the intended product site has never been deployed.

Sources:

- [Intended deployment workflow](../../../.github/workflows/deploy-www.yml).
- [Website deployment contract](../../../packages/www/deploy/README.md).
- [GitHub Pages deployment run](https://github.com/jixoai/unipty/actions/runs/32333176154)
  (Jekyll root source and deployed commit).
- [Documentation-site specification](../../../openspec/specs/documentation-site/spec.md).

### 4. OpenSpec task status is accurate only as an implementation-plan status

The archived Change shows all implementation tasks checked and only Owner-only
9.3 / 9.4 unchecked. That is correct as a record of planned task ownership,
but it does not override the current control-plane evidence: 9.3 cannot inspect
an attached release catalog for a tag that does not exist, and 9.4 cannot accept
the intended site while Pages serves the separate Jekyll deployment.

Sources:

- [Archived task list](../../../openspec/changes/archive/2026-08-20-add-unipty-v1-pty-platform/tasks.md),
  especially 7.4, 8.4, 9.3, and 9.4.
- [Release workflow](../../../.github/workflows/release.yml) and
  [Pages workflow](../../../.github/workflows/deploy-www.yml).

## Recommended next objective

**Restore a truthful release control plane, then release `0.1.1` from a green
exact commit.** This is one bounded objective with two ordered gates:

```text
CI runtime topology + Pages source configuration
        -> green exact-commit native conformance artifacts
        -> Owner accepts release artifact
        -> v0.1.1 tag / catalog / npm provenance publication
        -> manual intended-site deployment from that catalog
        -> Owner accepts Pages + CNAME/DNS
```

The release workflow already encodes the desired ordering. Repairing these
control-plane defects before a second public version avoids making `0.1.1` a
repeat of the untagged, un-attested `0.1.0` release. It also closes the only
currently public, unintended website deployment before expanding the product
surface with Windows evidence, parsers, remote Backends, or UI polish.

## Deferred directions

| Direction                         | Why it follows the release-control-plane objective                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Windows native evidence           | High value after CI can produce trustworthy evidence; no Windows route matrix is presently configured.             |
| Shell parser ecosystem            | Explicitly out of v1 scope and does not unblock consumers of the published PTY contract.                           |
| Persistent/remote backend-wrapper | Valuable v2 differentiation, but expands lifecycle authority before v1 support claims are traceable.               |
| Example/www polish                | The intended site must first be the deployed surface; then Owner-visible polish has meaningful acceptance context. |
