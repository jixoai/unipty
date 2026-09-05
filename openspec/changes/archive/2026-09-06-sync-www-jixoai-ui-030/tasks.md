> Execution law: implementation is delegated work; catalog evidence and
> release publication stay with the Owner.

## 1. Registry refresh

- [x] 1.1 0.3.0 items moved to a directory layout (`src/lib/ui/<name>/…`)
      and import sibling components (`$lib/ui/press-button/press-button.svelte`)
      plus shared modules (`$lib/icons`, `$lib/defaults`, `$lib/utils`) — the
      upgrade alone will leave these unresolved. Sequence: run
      `npx jixoai-ui upgrade` (refreshes the 7 locked items), then DELETE the
      stale flat files for items being re-added (shadcn 4.18 default-SKIPS
      existing files, so re-adding over a hand-patched file silently keeps the
      patch while the lock records canonical hashes — disk/lock drift), then
      explicitly `npx jixoai-ui add` the full closure present on disk:
      `toc website-scaffold press-button navigation-menu icons defaults utils
jixoai-theme popover density paint separator figure context-plugin
toc-engine` (…as actually installed). Verify every `src/lib/ui/**` file
      on disk is described by `jixoai-ui.lock` (sha256 spot-check) and no flat
      orphans (`src/lib/ui/<name>.svelte`) remain.
- [x] 1.2 Confirm the upgrade tasks replace the old hand patches (toc
      import paths, spine axis) or record in NOTES why a patch must remain.
- [x] 1.3 Verify hue 165 re-applies after the writes; `scrollbar-measure`
      still imported once in the root layout; app.css still supplies the
      token→utility mappings the registry sheet leaves empty
      (popover/destructive/input/ring/radius/shadows — our own NOTES pitfall).

## 2. AI export layer

- [x] 2.1 Add the `llms-txt` item; wire ONE generation point as the final
      step of `scripts/build.mjs` (`generateLlmsTxt(distDir, config)` — the
      plugin's own comment recommends exactly this for orchestrated builds),
      not a second plugin; absolute URLs; catalog + compatibility + docs pages
      included.
- [x] 2.2 Re-run build twice → byte-identical exports; extend
      `scripts/check-site.mjs` to assert the export exists and no excluded page
      has a mirror.

## 3. Verification

- [x] 3.1 `pnpm build` and `node scripts/check-site.mjs` pass on both
      fixtures with the refreshed components (three-state render, link check,
      catalog byte-identity intact).
- [x] 3.2 A second `npx jixoai-ui upgrade` run performs zero writes
      (lock/disk convergence proven).
- [x] 3.3 NOTES.md updated with deviations; friction log reported.
