# @unipty/www

Private static documentation site for [unipty.jixoai.com](https://unipty.jixoai.com),
built on the jixoai website stack — SvelteKit 2 + Svelte 5 + Vite +
Tailwind CSS v4 (CSS-first) + `@sveltejs/adapter-static` — and deployed to
GitHub Pages. It consumes **exactly one release catalog artifact, unchanged**.

Internal workspace package · [GitHub](https://github.com/jixoai/unipty) · [Workspace README](../../README.md)

## Law

- Never imports a native Backend entry (or any `@unipty/*` or `unipty`
  runtime package) anywhere in the browser bundle; the architecture check
  enforces the dependency direction. The browser never acquires or
  initializes a PTY Backend.
- Presentation derives only `verified` / `declared-unverified` /
  `not-targeted` from exact release metadata and evidence — no history
  merging, no runtime-version widening, no recomputing status client-side.
- The input catalog is validated, copied **byte-identically** into
  `dist/catalog/` (sha256 recorded) after the static build writes `dist/`,
  and the compatibility page is pre-rendered from it at build time.

## Build & checks

```sh
pnpm install                                  # once, from the repository root
node scripts/build.mjs                        # dev fixture by default
WWW_CATALOG=path/to/catalog.json node scripts/build.mjs    # explicit artifact
node scripts/check-site.mjs                   # static checks (both fixtures)
WWW_CNAME=1 ...                               # production build writes the CNAME
pnpm --filter @unipty/www run dev             # SvelteKit dev server on fixture data
```

`scripts/build.mjs` orchestrates everything: catalog selection
(CLI arg > `WWW_CATALOG` env > `fixtures/catalog.dev.json`), validation,
generated page data (`src/lib/generated/`, gitignored), a synchronous
`vite build` into `dist/`, the byte-identical catalog copy, the published
stylesheet at `dist/assets/styles.css`, and the production-only `dist/CNAME`.

Checks cover: clean build, byte-identical catalog copy, internal links,
exact three-state labels (no fourth state), no backend/resolver module
references in output, responsive basics, and the CNAME gate.

## Deployment

Deployed by `.github/workflows/deploy-www.yml` (`workflow_dispatch` with a
`release_tag` input): download that release's `catalog.json` artifact →
install the site devDependencies → build with `WWW_CNAME=1` → static checks →
GitHub Pages deploy. Retrying re-consumes the same immutable artifact and
never republishes packages. The `unipty.jixoai.com` CNAME/DNS mapping is
Owner-managed external configuration.

Visual reference: the sibling OpenSpecUI official site (inspected at
revision `c6ddab02`; see [NOTES.md](NOTES.md)) — a reference only, never a
source dependency. Site identity follows the jixoai website skill: brand hue
`160` (phosphor green) is the only per-project color variable.
