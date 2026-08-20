# @unipty/www

Private static documentation site for [unipty.jixoai.com](https://unipty.jixoai.com):
zero-dependency, hand-authored HTML/CSS built by a small Node script, deployed
to GitHub Pages. It consumes **exactly one release catalog artifact, unchanged**.

Internal workspace package · [GitHub](https://github.com/jixoai/unipty) · [Workspace README](../../README.md)

## Law

- Never imports a native Backend entry (or any `@unipty/*` runtime package)
  into a browser bundle; the architecture check enforces the dependency
  direction. The browser never acquires or initializes a PTY Backend.
- Presentation derives only `verified` / `declared-unverified` /
  `not-targeted` from exact release metadata and evidence — no history
  merging, no runtime-version widening, no recomputing status client-side.
- The input catalog is validated, copied **byte-identically** into
  `dist/catalog/` (sha256 recorded), and rendered at build time.

## Build & checks

```sh
WWW_CATALOG=path/to/catalog.json node scripts/build.mjs    # build (dev fixture by default)
node scripts/check-site.mjs path/to/catalog.json           # static checks
WWW_CNAME=1 ...                                            # production build writes the CNAME
```

Checks cover: clean build, byte-identical catalog copy, internal links,
exact three-state labels (no fourth state), no backend/resolver module
references in output, responsive basics, and the CNAME gate.

## Deployment

Deployed by `.github/workflows/deploy-www.yml`
(`workflow_dispatch` with a `release_tag` input): download that release's
`catalog.json` artifact → build with `WWW_CNAME=1` → static checks →
GitHub Pages deploy. Retrying re-consumes the same immutable artifact and
never republishes packages. The `unipty.jixoai.com` CNAME/DNS mapping is
Owner-managed external configuration.

Visual reference: the sibling OpenSpecUI official site (inspected at
revision `c6ddab02`; see [NOTES.md](NOTES.md)) — a reference only, never a
source dependency.
