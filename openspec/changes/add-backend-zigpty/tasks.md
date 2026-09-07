## 1. Package

- [x] 1.1 `packages/backend-zigpty` scaffold mirroring backend-node-pty:
      package.json (name `@unipty/backend-zigpty`, version 0.2.0, exact dep
      `zigpty@0.2.1`, `#package.json` alias, `.`, `./unipty.metadata`
      exports), tsdown config (neutral platform, substrate + alias external),
      tsconfig, vitest config (sibling source aliases).
- [x] 1.2 `src/index.ts`: `createZigptyBackend()` with hasNative gate and
      option validation; `ZigptyEndpoint` with tagged NativeChunk output,
      text-only write + writeDecode convenience, bounded queue + drain,
      public pause/resume backpressure, synthesized transport EOF, deferred
      substrate close, terminate, signal-name mapping.
- [x] 1.3 `src/unipty.metadata.ts`: schema 1, id `zigpty`,
      `factoryExport: "createZigptyBackend"`, `protocol.core [1]`,
      `targets [{ runtime: "node" }]`, third-party provenance.
- [x] 1.4 Adapter tests: factory (readiness shape, native declarations per
      mode, typed launch failures, hasNative surface), endpoint (chunk
      tagging, geometry + observable resize, exit observation incl.
      signal-death and exec-failure-as-exit, close/terminate non-cascading,
      backpressure saturation + drain recovery, decoder isolation),
      metadata (schema, identity, side-effect-free import).
- [x] 1.5 README.md + README-zh.md documenting the route, the text-only
      input surface + writeDecode, and the native gate.

## 2. Route wiring

- [x] 2.1 `packages/conformance/src/catalog.ts`: `OFFICIAL_ROUTE_PACKAGES`
      re-keyed by route id (+ zigpty); coverage gate loop + tests updated.
- [x] 2.2 Conformance runner maps: `runners/run-profile.ts` ROUTE_PACKAGES,
      `scripts/pack-and-install.mjs`, `scripts/run-installed-profile.mjs`,
      `scripts/collect-release-evidence.mjs` (the release workflow's metadata
      collector — without its zigpty entry, aggregation rejects zigpty
      evidence for lacking a metadata snapshot);
      `packages/conformance/package.json` devDependency.
- [x] 2.3 `scripts/check-architecture.sh.ts`: required-package list +
      substrateAllowlist (`zigpty`).
- [x] 2.4 `.github/workflows/ci.yml`: quality unit-suite filter;
      conformance-matrix zigpty cells (ubuntu, macos; node).
- [x] 2.5 `.github/workflows/release.yml`: pack list + publish order.
- [x] 2.6 `packages/example`: RUNTIME_FOR_BACKEND entry + frontend tab.
- [x] 2.7 `packages/www`: en/zh route cards, llms summary, docs surfaces.
- [x] 2.8 Release-equivalent aggregation acceptance: catalog unit tests
      assert the four-route aggregate succeeds and that missing zigpty
      evidence blocks the release independently of the sibling node route.
- [x] 2.9 Documentation sweep: Core README ±zh install lines, example
      README, 架构设计.md (package tree, release gate, substrate-truth
      table), 贡献规范.md test matrix — no residual three-route semantics
      outside timestamped decision history.

## 3. Verification

- [x] 3.1 Local gates: fmt, check:arch, build, typecheck, all unit suites.
- [x] 3.2 Installed-package conformance: `pack-and-install.mjs zigpty` +
      `run-installed-profile.mjs zigpty node` — all scenarios pass, evidence
      record produced (darwin-arm64 native tuple).
- [ ] 3.3 Codex review rounds (change doc + implementation) addressed.

## 4. Release

- [ ] 4.1 Spec/docs sync: openspec specs, `.scratch/unipty-v1/spec.md`,
      root AGENTS.md, root README/README-zh route lists.
- [ ] 4.2 Archive change, merge to main, CI conformance matrix green
      (zigpty evidence on ubuntu + macos).
- [ ] 4.3 npm Trusted Publishing configured for `@unipty/backend-zigpty`
      (Owner, outside the repo); tag `v0.2.1`; release publishes the new
      package, attaches the catalog, www deploy consumes it.
