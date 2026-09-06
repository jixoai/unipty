# documentation-site Specification

## Purpose

Publish static UniPty documentation and exact compatibility evidence without
creating a browser PTY runtime, a Core dependency, or a second evidence source.

## Requirements

### Requirement: Static site and runtime isolation

The system SHALL provide private workspace `packages/www` as a static official
documentation site. It SHALL not import native Backend entry modules into a
browser bundle, execute local PTY operations in a browser, define Core contract
behaviour, or become a runtime dependency of Core or Backend packages.

#### Scenario: Browser visitor cannot trigger local Backend acquisition

- **WHEN** a visitor views the official site
- **THEN** the site renders documentation and examples without dynamically
  importing or initializing a native Backend

### Requirement: Immutable catalog presentation

The site build SHALL accept an explicitly selected release catalog artifact,
validate it, and copy it unchanged into static output. It SHALL present only
`verified`, `declared-unverified`, and `not-targeted` states from exact release
metadata and evidence; it SHALL not merge catalog history, re-run probes, widen
runtime versions, or turn absent evidence into support.

#### Scenario: Missing evidence is displayed conservatively

- **WHEN** a released target declaration matches a tuple without exact evidence
- **THEN** the site displays declared-unverified and does not label the tuple as
  supported or verified

### Requirement: GitHub Pages and custom domain ownership

The site SHALL deploy as static output through GitHub Pages. The repository
deployment workflow SHALL treat `unipty.jixoai.com` DNS CNAME mapping as Owner-
managed external configuration and SHALL not require Core or Backend publication
to wait for a site deployment retry.

#### Scenario: A site deployment retry does not republish packages

- **WHEN** package release and catalog attachment have succeeded but GitHub Pages
  deployment fails
- **THEN** the site deployment can be retried from the explicit release artifact
  without republishing Core or Backend packages

### Requirement: Implementation-time visual reference

The website implementation SHALL use the sibling `../openspecui` official site
as its visual reference at implementation time. It SHALL inspect that project
when implementation begins and SHALL not make it a source dependency, git
submodule, build input, or constraint on the Core/Backend package graph.

#### Scenario: Website styling remains operationally independent

- **WHEN** the OpenSpecUI project is unavailable to a deployed website build
- **THEN** the UniPty site still builds from its own workspace assets and release
  artifact without resolving a sibling source dependency

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

### Requirement: Browser language negotiation on the default surface

Default-locale pages SHALL negotiate the visitor language before first
paint: an explicit persisted choice wins; otherwise the first
navigator.languages match among available locales redirects once to the
same page under its locale prefix. Non-default pages never redirect.

#### Scenario: zh browser lands on zh

- **WHEN** a browser with zh preference loads the default-locale page
- **THEN** it is redirected (path + hash preserved) to the `/zh/`
  mirror before content paints.

#### Scenario: explicit choice beats detection

- **WHEN** the visitor has persisted a language choice via the switcher
- **THEN** no detection redirect occurs.
