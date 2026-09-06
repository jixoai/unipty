## ADDED Requirements

### Requirement: Bilingual locale surface (en/zh)

The site SHALL serve English at the root (stable URLs, catalog seam
untouched) and Chinese mirrors at `/zh/` for every public page, with
per-locale `<html lang>`, hreflang alternates, a visible language switcher,
locale-covered AI export, and the static check suite extended to assert the
zh surface on both fixtures.

#### Scenario: zh mirror

- **WHEN** `/zh/`, `/zh/compatibility.html`, and `/zh/docs.html` are built
- **THEN** each renders Chinese prose from README-zh.md with verbatim
  catalog evidence strings, `lang="zh"`, and hreflang links for en, zh,
  and x-default.

#### Scenario: check suite covers locales

- **WHEN** `node scripts/check-site.mjs` runs on either fixture
- **THEN** the zh pages pass the same link, render, responsive, and export
  checks as the en pages.
