# UniPty Website Implementation Notes

Private static official documentation site for UniPty (`@unipty/www`),
deployed to GitHub Pages at `unipty.jixoai.com` (Owner-managed CNAME).

## Task 8.1 — Visual reference inspection record

- **Inspected project**: sibling `../openspecui` official site, package
  `packages/website` (`@openspecui/website`).
- **Inspected revision**: `c6ddab02`
  (2026-08-20 03:09:53 +0800, "Merge pull request #257 from
  jixoai/docs/spec/archive-stabilize-windows-ci-gate").
- **Inspected on**: 2026-08-20 (Asia/Shanghai).
- **What was inspected**: `packages/website/package.json`,
  `src/app.html`, `src/lib/styles/app.css`, the shared theme token sheet at
  `packages/web/src/index.css`, `src/routes/+layout.svelte`,
  `src/routes/+page.svelte`, and the repository workflow directory
  (`.github/workflows/`).

## Restyle (2026-08-20) — jixoai unified website style

The site was restyled to the jixoai unified identity defined by the
`jixoai-website` skill (`~/.agents/skills/jixoai-website`), whose reference
implementation is the OpenSpecUI site inspected above. The original
zero-dependency, hand-authored HTML/CSS build was replaced by the shared
stack; the content seams (catalog selection order, byte-identical copy,
CNAME gate, static checks) are unchanged.

### Stack

- **Framework**: SvelteKit 2 + Svelte 5 runes, static-prerendered
  (`prerender`, `trailingSlash: 'never'`) through
  `@sveltejs/adapter-static` (`dist/`, `strict`). Pages are flat files:
  `index.html`, `docs.html`, `compatibility.html`.
- **Build**: Vite 8 + `@sveltejs/vite-plugin-svelte`; `scripts/build.mjs`
  remains the single orchestration entry and runs `vite build`
  synchronously (`spawnSync`) so `runBuild` keeps its synchronous,
  `BuildError`-throwing contract for `check-site.mjs`.
- **CSS**: Tailwind CSS v4 via `@tailwindcss/vite` (CSS-first, no
  tailwind.config) with the jixoai HSL token sheet in `src/app.css`.
  `--brand-hue: 160` (phosphor green) is the only per-project color
  variable; functional colors (yellow secondary, blue accent, neutrals,
  hard black shadows) are fixed across jixoai sites.
- **Fonts**: `@fontsource-variable/jetbrains-mono` +
  `@fontsource/share-tech-mono`, bundled locally — zero font network
  requests.
- **Icons**: `lucide-svelte` deep imports (theme switcher, external-link
  arrows).
- **Motion**: the skill's two-pattern law — `reveal` action +
  IntersectionObserver entrance (rule-draw variant included) and press
  physics on interactive elements; `prefers-reduced-motion: reduce`
  disables both.

### Deliberate divergences from the reference (documented per skill law)

- **No mdsvex/shiki.** The site ships three short pages, not a prose
  corpus; a ~30-line build-stable tokenizer (`src/lib/highlight.ts`)
  tints comments/strings/keywords/numbers through the same theme tokens
  the reference achieves with dual-theme shiki. Deterministic output
  keeps `{@html}` hydration-safe.
- **Terminal cursor does not blink.** The reference hero terminal blinks
  its cursor forever; the skill's motion law forbids looping/ambient
  animation, so the cursor is a static block and the typing story is a
  one-shot entrance that degrades to the settled terminal under reduced
  motion or without JS.
- **`theme-color` is `#000000`**, matching the token sheet's pure-black
  dark canvas (the reference's `#09090b` matches its own zinc-tinted
  canvas).
- **MPA navigation.** `<body data-sveltekit-reload>` makes every internal
  link a full page load so the flat `docs.html`/`compatibility.html`
  artifact keeps working without client-route resolution; prerendering
  crawls nothing (`crawl: false` + explicit entries).
- **Published stylesheet path.** The emitted CSS bundle is republished as
  `dist/assets/styles.css` (font URLs rewritten to absolute `/_app`
  paths) because `check-site.mjs` reads that exact path; page links are
  rewritten to it.
- **`PressButton` internal links.** The reference component always opens
  `target="_blank"`; UniPty CTAs navigate site pages, so the component
  auto-detects external hrefs and reserves `_blank`/`noreferrer` for
  them.
- **Deploy workflow installs devDependencies.** The restyle replaced the
  zero-dependency assembler, so `deploy-www.yml` gained
  `pnpm/action-setup` + a filtered `pnpm install --frozen-lockfile`
  before `node packages/www/scripts/build.mjs`. The build entry, catalog
  contract, and CNAME gate are unchanged.

### No source dependency (task 8.1 requirement)

`openspecui` is **not** a source dependency, git submodule, or build input
of this package. Nothing under `packages/www` imports, resolves, vendors,
or references `../openspecui` at build or runtime. The UniPty site builds
from its own workspace assets plus exactly one release catalog artifact.
`@unipty/www` declares zero runtime dependencies; its devDependencies are
the site toolchain only (no `@unipty/*`, `unipty`, or `@unipty/backend-*`
edges — the workspace architecture check scans devDependencies too).

## Build-time data seam

`scripts/build.mjs` writes `src/lib/generated/catalog.json` (the derived
presentation) and `src/lib/generated/release.json` (sha256 + byte count)
before each `vite build`; the directory is gitignored and regenerated on
every build. The compatibility page imports it at module scope, so the
evidence derivation never ships as inline hydration data and never runs in
the browser.

## Task 8.4 — GitHub Pages workflow summary

The deployment contract lives in [`deploy/README.md`](deploy/README.md)
and `.github/workflows/deploy-www.yml`: `workflow_dispatch` with a release
tag; download that release's catalog artifact; install site
devDependencies; build with `WWW_CATALOG` + `WWW_CNAME=1`; run static
checks; deploy `dist/` to Pages. Retries re-consume the same immutable
artifact and never republish packages.

## Build and check entry points

- `node scripts/build.mjs` (or `pnpm --filter @unipty/www run build`) —
  validate catalog, run the static build, byte-identical copy to
  `dist/catalog/catalog.json` (sha256 logged), publish the stylesheet,
  write `dist/CNAME` only when `WWW_CNAME=1`.
- `node scripts/check-site.mjs` (or `pnpm --filter @unipty/www run test`) —
  clean-build from both committed fixtures and run the static checks
  (links, catalog byte-identity, three-state rendering, no browser backend
  imports, responsive smoke, CNAME gate).

Catalog input selection: CLI arg > `WWW_CATALOG` env > committed
development fixture `fixtures/catalog.dev.json`.
