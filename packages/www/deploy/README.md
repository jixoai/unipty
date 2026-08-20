# GitHub Pages deployment contract for `packages/www`

> The repository `.github/workflows/` directory is owned by the CI track.
> This file documents the exact contract the website expects so the CI
> agent can wire the workflow without re-deriving decisions. No workflow
> files live in this package.

## Contract summary

| Aspect        | Contract                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger       | `workflow_dispatch` with a required `release_tag` input (e.g. `v0.1.0`)                                                                  |
| Catalog input | The catalog JSON artifact attached to that release (exact asset name is owned by the release track, task 7.4)                            |
| Toolchain     | `pnpm/action-setup` + filtered `pnpm install --frozen-lockfile` (site devDependencies only; no runtime packages)                         |
| Build         | `WWW_CNAME=1 WWW_CATALOG=<downloaded artifact path> node packages/www/scripts/build.mjs`                                                 |
| Deploy        | `packages/www/dist` uploaded with `actions/upload-pages-artifact`, deployed with `actions/deploy-pages`                                  |
| Custom domain | `unipty.jixoai.com`; DNS CNAME mapping is **Owner-managed external configuration**                                                       |
| Retry         | Re-run the workflow with the same tag; it re-consumes the same immutable release artifact and never republishes Core or Backend packages |

## Intended workflow shape

```yaml
name: Deploy website (GitHub Pages)

on:
  workflow_dispatch:
    inputs:
      release_tag:
        description: "Release tag whose attached catalog artifact is presented"
        required: true
        type: string

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4 # site sources from the default branch
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: Download release catalog artifact
        run: |
          gh release download "${RELEASE_TAG}" \
            --pattern 'unipty-catalog*.json' \
            --dir "${RUNNER_TEMP}/catalog"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          RELEASE_TAG: ${{ inputs.release_tag }}
      - name: Build site from the release artifact
        run: |
          CATALOG="$(find "${RUNNER_TEMP}/catalog" -name '*.json' -type f | head -n1)"
          test -n "${CATALOG}"
          WWW_CNAME=1 WWW_CATALOG="${CATALOG}" \
            node packages/www/scripts/build.mjs
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/www/dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

(The asset pattern `unipty-catalog*.json` is a placeholder for the exact
artifact name fixed by the release track; adjust it in one place.)

## Why this satisfies the spec

- **Static isolation** — the build is `node scripts/build.mjs`: the site
  toolchain is devDependencies-only (SvelteKit/Vite/Tailwind/fonts), no
  runtime package dependency, no Backend import. A browser visitor
  receives static documentation only.
- **Immutable catalog presentation** — the downloaded artifact is validated
  and copied **byte-identical** into `dist/catalog/catalog.json` (sha256 in
  the build log); the compatibility page is pre-rendered at build time from
  that one artifact. Re-running the workflow with a different tag presents
  that tag's catalog and nothing merged.
- **Retry without publication** — package release and catalog attachment
  happen in the release workflow (task 7.4). A failed Pages deploy is
  retried by dispatching this workflow again with the same tag; it never
  reruns publication and cannot republish packages.
- **CNAME ownership** — `WWW_CNAME=1` makes the build write
  `dist/CNAME` containing exactly `unipty.jixoai.com`. The DNS CNAME
  mapping and the Pages custom-domain setting are accepted by the Owner
  (task 9.4), not by this workflow.

## Rules for the CI track

1. Preview builds (pull requests, pushes without a release) MUST NOT set
   `WWW_CNAME`; preview output stays CNAME-free.
2. The workflow MUST fail before deploy when the artifact is missing or
   malformed — the build script exits non-zero in both cases.
3. Do not cache or mutate the catalog between download and build; the site
   build log must be able to attribute the sha256 of the exact bytes it
   copied.
4. Do not add runtime dependencies to `@unipty/www`, and never add
   `@unipty/backend-*`, `unipty`, `@unipty/backend`, or
   `@unipty/helper-backend` edges (any dependency kind); the workspace
   architecture check rejects them. Site toolchain lives in
   devDependencies.

## Local preview

```sh
pnpm install                       # once, from the repository root
cd packages/www
node scripts/build.mjs             # dev fixture, no CNAME
node scripts/build.mjs path/to/catalog.json  # explicit artifact
python3 -m http.server -d dist 4173          # open http://127.0.0.1:4173
```

Automated static checks (build, byte-identity, links, three-state
rendering, forbidden browser imports, responsive smoke) run with:

```sh
node scripts/check-site.mjs            # both committed fixtures
node scripts/check-site.mjs a.json b.json   # explicit catalogs
```
