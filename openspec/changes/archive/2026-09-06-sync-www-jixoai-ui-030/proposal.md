> Orthogonal intents (maintained 2026-09-06 Asia/Shanghai): www registry
> refresh; AI export adoption; lock hygiene.
>
> Original request (2026-09-06 Asia/Shanghai): 更新 ./unipty 的官网站点
> （背景：./jixoai-ui 发布了新版本 0.3.0）。

## Why

`packages/www` consumes the `@jixoai` registry under `jixoai-ui.lock`, but
all 7 locked items have drifted from the published 0.3.0 registry (component
internals moved to shared `$lib` modules — icons, defaults, utils — plus the
tw4 pure-utility migration). The site also predates the `llms-txt` item, so
it ships no AI export layer while the family law now requires one.

## What Changes

- Refresh every locked item to the 0.3.0 registry (`npx jixoai-ui upgrade`)
  and resolve the new cross-component dependencies (`icons`, `defaults`,
  `utils`, `jixoai-theme` items) as locked items rather than hand copies.
- Fold the two untracked installs (`toc`, `website-scaffold`) into the lock:
  re-add them from the registry so the legacy import-path patches are
  replaced by canonical content + upgrade tasks.
- Adopt the `llms-txt` item: one generation point wired into the existing
  orchestrated build (`scripts/build.mjs` final step, NOT a second vite
  plugin), absolute URLs, byte-identical re-runs, catalog pages included.
- Keep every documented seam untouched: immutable catalog copy, CNAME gate,
  check-site static checks, no `@unipty/*` dependency edges, dual-mode
  build.
- Update `NOTES.md` with any new deliberate deviations only.

## Capabilities

### Modified Capabilities

- `documentation-site`: registry-refreshed chrome; AI export output.
