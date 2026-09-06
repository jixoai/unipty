> Orthogonal intents (maintained 2026-09-06 Asia/Shanghai): site i18n (en/zh);
> check-suite extension.
>
> Original request (2026-09-06 Asia/Shanghai): 所有站点需要至少提供中英两种
> 语言的支持。README-zh.md 已存在，作为 zh 文案信源。

## Why

The www site ships English-only while the family convention expects a zh
mirror; README-zh.md already carries the canonical Chinese positioning.

## What Changes

- Site i18n: `/` stays English (stable URLs, catalog seam untouched); add
  `/zh/` mirrors of the three public pages (index, compatibility, docs)
  with zh copy from README-zh.md (catalog evidence strings stay verbatim —
  they are artifact data, not prose). Per-locale `<html lang>`, hreflang
  alternates, registry `language-switcher` (add + lock) wired into the
  header. llms export covers both locales (the flat `.html` route caveat
  in NOTES applies per locale).
- `scripts/check-site.mjs` extended: zh pages join the link check,
  three-state render, responsive smoke, and llms export shape checks for
  BOTH fixtures.

## Capabilities

### Modified Capabilities

- `documentation-site`: locale surface + extended static checks.
