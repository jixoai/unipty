## ADDED Requirements

### Requirement: Registry-conformant site chrome

The site's components SHALL come from the `@jixoai` registry and be fully
described by `jixoai-ui.lock` — every installed file is locked, refreshable
via `npx jixoai-ui upgrade`, and free of hand patches the registry has since
canonicalized.

#### Scenario: full-lock refresh

- **WHEN** `npx jixoai-ui upgrade` runs against the 0.3.0 registry
- **THEN** all items (including `toc` and `website-scaffold`) converge to
  registry content, `pnpm build` + `node scripts/check-site.mjs` pass, and a
  second upgrade run performs zero writes.

### Requirement: AI export layer

The deployed site SHALL ship `llms.txt`, `llms-full.txt`, and per-page
`.md` mirrors generated from ONE generation point in the orchestrated
build, with absolute URLs and byte-identical re-runs, leaving robots/sitemap
untouched.

#### Scenario: orchestrated generation

- **WHEN** `scripts/build.mjs` completes (both CNAME modes)
- **THEN** the dist contains the export files, the check suite asserts
  their presence and stability, and no page outside the public surface has
  a mirror.
