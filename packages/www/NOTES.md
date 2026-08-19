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

### Findings from the reference

- **Framework**: SvelteKit 2 + Vite 8 with `@sveltejs/adapter-static`,
  mdsvex for markdown, shiki for syntax highlighting (all devDependencies).
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` with a shadcn-style
  CSS custom-property token sheet in `oklch()`; `.dark` class theming plus a
  no-flash theme bootstrap; `theme-color` `#09090b`.
- **Typography**: mono-first identity — `--font-sans` and `--font-mono` are
  both JetBrains Mono (locally hosted font assets), with Share Tech Mono for
  nav accents; monospace is the site voice, not an afterthought.
- **Look**: terminal/neo-brutalist — 1px solid borders, hard offset shadows
  (`4px 4px 0px`), radius `0` upgraded to `8px` only where
  `corner-shape: bevel` is supported, orange-red primary
  (`oklch(0.6489 0.237 26.9728)` light / `oklch(0.7044 0.1872 23.1858)`
  dark), blue accent (`oklch(0.5635 0.2408 260.8178)` light).
- **Deployment**: the reference deploys through **Cloudflare Pages**
  (`wrangler pages deploy`), not GitHub Pages; no GitHub Pages workflow
  exists in that repository to copy.

### Chosen approach for packages/www

**Zero-dependency, hand-authored static site**: plain HTML templates +
one `styles.css` + one small `site.js`, assembled by a Node build script
(`scripts/build.mjs`). No framework, no package install.

Rationale:

1. The site is three pages with build-time-rendered content. A framework
   would add an install step and a dependency graph the architecture check
   polices, for no capability this site needs. The prompt's environment
   constraint (no `pnpm install` from this track) makes a zero-dependency
   path strictly safer.
2. The reference's SvelteKit stack was evaluated and **not** adopted; its
   _visual_ language (token sheet structure, mono typography, hard-shadow
   terminal aesthetic, dark-mode-first with `.dark` class and no-flash
   bootstrap) was transcribed into a hand-written token sheet instead.
   Visual cues taken: oklch token naming, mono-first typography scale,
   orange primary / blue accent pair, 1px borders with hard offset shadows,
   bevel-corner upgrade, `#09090b` dark canvas.
3. Fonts: the system monospace stack (`ui-monospace, SF Mono, Menlo,
Consolas, ...`). The reference's JetBrains Mono webfont files are local
   assets of that project and were deliberately **not** copied.
4. Syntax highlighting: hand-authored `<span>` classes in a tiny highlight
   helper at build time; no shiki dependency.

### No source dependency (task 8.1 requirement)

`openspecui` is **not** a source dependency, git submodule, or build input
of this package. Nothing under `packages/www` imports, resolves, vendors,
or references `../openspecui` at build or runtime. The UniPty site builds
from its own workspace assets plus exactly one release catalog artifact.
`@unipty/www` declares zero dependencies and zero devDependencies, so the
workspace dependency graph is unchanged by this package.

## Task 8.4 — GitHub Pages workflow summary

The repository `.github/workflows/` directory is owned by the CI track; this
package deliberately contains **no workflow files**. The intended deployment
contract is documented in [`deploy/README.md`](deploy/README.md):

- Trigger: `workflow_dispatch` with a release tag input; the job downloads
  the catalog artifact attached to that release.
- Build: `pnpm --filter @unipty/www build` with `WWW_CATALOG` pointing at
  the downloaded artifact and `WWW_CNAME=1` so `dist/CNAME` is written.
- Deploy: `dist/` to GitHub Pages; `unipty.jixoai.com` DNS is Owner-managed
  external configuration.
- Retryable: re-running the workflow re-consumes the same immutable release
  artifact; it never republishes Core or Backend packages.

## Build and check entry points

- `pnpm --filter @unipty/www build` — validate catalog, byte-identical copy
  to `dist/catalog/catalog.json` (sha256 logged), render pages, write
  `dist/CNAME` only when `WWW_CNAME=1`.
- `pnpm --filter @unipty/www test` — clean-build from both committed
  fixtures and run the static checks (links, catalog byte-identity,
  three-state rendering, no browser backend imports, responsive smoke).

Catalog input selection: CLI arg > `WWW_CATALOG` env > committed
development fixture `fixtures/catalog.dev.json`.
