# UniPty Website Implementation Notes

Private static official documentation site for UniPty (`@unipty/www`),
deployed to GitHub Pages at `unipty.jixoai.com` (Owner-managed CNAME).

## Registry consumption (2026-08-20) — first real jixoai registry consumer

The site now consumes the official jixoai design-language registry
(<https://ui.jixoai.com>) instead of hand-copying the identity:

- `components.json` registers the `@jixoai` namespace (aliases:
  `ui → src/lib/ui`, `lib → src/lib`, `hooks → src/lib/hooks`,
  `components → src/lib`; `tsx: true` is required by the shadcn config
  schema even for this Svelte project).
- `src/lib/jixoai.css` is the **verbatim registry artifact**
  (`jixoai-theme` item) with `--brand-hue: 165` applied. `src/app.css`
  imports it and keeps only site supplements: chart tokens, `--shadow-lg`,
  readonly-code/tok palettes, the Tailwind token→utility mappings the
  registry sheet leaves open (popover/destructive/input/ring/radius/
  shadows — without them Tailwind silently falls back to its soft default
  scale), and the site surfaces (data tables, badges, evidence,
  readonly code). Token values are byte-identical to the previous
  handwritten sheet for every token the registry defines (only cosmetic
  quote style differs on `--font-nav`; the registry drops the unused
  second layer of `--shadow` in dark mode). _(2026-09-06: superseded by
  the 0.3.0 sync below — the registry theme now ships the
  popover/destructive/input/ring/shadows mappings itself.)_
- `src/lib/ui/toc.svelte` + `src/lib/toc.css` + `src/lib/toc-engine.ts`
  are the registry `toc` item (Combo ToC), installed with two import-path
  corrections for SvelteKit: `@lib/toc-engine` → `$lib/toc-engine` and
  `'../lib/toc.css'` → `$lib/toc.css` (the shipped paths assume a
  non-SvelteKit alias layout). _(2026-09-06: superseded — 0.3.0 ships
  SvelteKit-correct `$lib` paths in the directory layout; the manual
  corrections and these flat files are retired.)_
- The docs page wraps its content in the engine's contract: leaf blocks
  carry `data-region`, parent sections carry `data-family` (exposed on
  `SectionCard` via `family` / `region` / `headerRegion` props). The
  `aside` precedes main content in the DOM; the page grid places it as
  the sticky right column on desktop and the sticky `height: 0` glass
  rail on mobile (68px main-content top clearance, 76px anchor
  scroll-margin matching the engine's mobile pick line).

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
  tailwind.config). The jixoai OKLCH token sheet is consumed from the
  registry (`src/lib/jixoai.css`, see above). `--brand-hue: 165`
  (phosphor green) is the only per-project color variable; functional
  colors (yellow secondary, blue accent, neutrals, hard black shadows)
  are fixed across jixoai sites.
- **Fonts**: `@fontsource-variable/jetbrains-mono` +
  `@fontsource/share-tech-mono`, bundled locally — zero font network
  requests.
- **Icons**: no icon library — the registry `theme-toggle` (and the whole
  registry chrome set) carries inline SVG. The earlier `lucide-svelte`
  dependency was removed with the local theme switcher it served
  (2026-08-21).
- **Motion**: the skill's two-pattern law — `reveal` action +
  IntersectionObserver entrance (rule-draw variant included) and press
  physics on interactive elements; `prefers-reduced-motion: reduce`
  disables both. SPA navigations add the tab-carousel View Transition
  (below), which reduced motion degrades to a plain crossfade.
  _(2026-09-06: reveal is now pure CSS scroll-driven in 0.3.0; the IO
  action is retired — see the 0.3.0 sync section.)_

### SPA + overlay scaffold (2026-08-21) — registry app-shell landing

The site consumed the registry overlay scaffold (`app-shell` /
`scaffold-float` / `terminal-header` / `terminal-footer` / `theme-toggle`,
synced verbatim from the jixoai ui registry source repo):

- **Overlay architecture.** `.jx-shell` is a fixed-height viewport; the
  header band and the docs ToC float live in one `.jx-top-layer` overlay
  that slides away on scroll-down and back on scroll-up (immersive), while
  `.jx-shell-body` owns the scrolling with a measured `padding-top` reserve.
  The docs aside is authored in the page but adopted into the top layer by
  the `scaffold-float` portal — the mobile glass rail rides the header by
  construction.
- **SPA navigation.** `data-sveltekit-reload` is gone: internal links route
  client-side through an `onNavigate` View Transitions runner with the
  tab-carousel direction law (PAGE_ORDER index comparison, ported from the
  showcase/openspecui). Route directories carry the `.html` suffix
  (`docs.html/`, `compatibility.html/`) so the client router resolves the
  same URLs the flat artifact files serve for direct loads and no-JS.
- **Named-line law.** Anchor landing moved from the site-level
  `[id] { scroll-margin-top: 76px }` rule to the registry `toc.css`
  contract: the ToC publishes `--jx-toc-line` (measured overlay-stack
  bottom + 2em) and `.jx-shell-body` consumes it via `scroll-padding-top`.
  The two mechanisms must never coexist for one container (they stack).
  _(2026-09-06: the named-line contract survives in 0.3.0 unchanged; the
  `scaffold-float` docs aside it served is retired — the toc rail now
  renders from the website-scaffold's chrome plane. The float item stays
  locked for the portal API.)_

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
- **SPA navigation.** Internal links route client-side (see the
  2026-08-21 scaffold section above); the flat `docs.html` /
  `compatibility.html` artifact keeps serving direct loads and no-JS, and
  prerendering still crawls nothing (`crawl: false` + explicit entries).
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

## jixoai-ui 0.3.0 sync (2026-09-06) — directory layout + AI export layer

Upgraded from 0.2.0 to 0.3.0 (openspec change
`2026-09-06-sync-www-jixoai-ui-030`). The lock now describes **26 items /
71 files**; every `src/lib/ui/**` file is canonical — zero hand patches
remain, and a second `npx jixoai-ui@0.3.0 upgrade` performs zero writes
(`updated 0, unchanged 71`). The three upgrade tasks
(legacy-import-paths, spine-axis, scroll-margin-cleanup) all skip on
fresh 0.3.0 content.

### Breaking-API adaptations (site code)

- **Directory layout.** Items live at `src/lib/ui/<name>/<name>.svelte`
  and import siblings/shared modules through `$lib` aliases. The old
  flat files (`src/lib/ui/<name>.svelte`), the hand-copied
  `src/lib/jixoai.css`, `src/lib/toc.css`, `src/lib/toc-engine.ts`,
  `src/lib/website-scaffold.css`, and the manual
  `components/press-button.svelte` / `components/section-card.svelte`
  were deleted before re-adding (0.3.0's `upgrade` does not remove
  0.2.0 flat files; re-`add` over them would silently keep stale bytes
  while the lock records canonical hashes).
- **terminal-header / terminal-footer are composition-first.** The
  header's `items` data tree is gone: `+layout.svelte` renders a
  NavigationMenu combo in the header `children` snippet (current-page
  derived from `page.url`), a `drawer` snippet for mobile, and
  `bind:open` closed on navigate. The footer composes
  `TerminalFooterColumn` children instead of a data tree.
- **hero-section is composition-first.** String props
  (eyebrow/summary/copyCommand) + snippet props
  (title/badges/copy/terminal/secondary). Deviation: `copyCommand`
  stays **required** by the props interface even when a `copy` snippet
  replaces the default command surface — the hero passes an inert
  value (the real install command, so it at least stays truthful) that
  is never rendered.
- **toc rides the chrome snippet.** 0.3.0's website-scaffold renders
  the toc rail from the chrome plane; the docs page publishes its tree
  via `+page.ts load()` returning `toc` (the ui repo's site-mode data
  seam), and the layout's chrome snippet composes
  `TocList`/`TocItem`/`TocLink` from `page.data.toc`
  (`scrollRoot=".jx-shell-body"`, MANUAL mode). The page's old
  `ScaffoldFloat` aside + custom grid CSS are deleted; the mobile toc
  bar comes with the scaffold.
- **reveal is pure CSS** (scroll-driven, `animation-timeline: view()`).
  The IO `reveal` action (`src/lib/actions/reveal.ts`) is retired;
  static `data-reveal` attributes stay (feature rows keep a manual
  `--reveal-rise` stagger). `card-grid` ships its own IO entrance —
  cards inside a `CardGrid` must NOT wrap `data-reveal`.
- **SectionCard requires `children`.** A header-only card passes an
  empty snippet (`{#snippet children()}{/snippet}`) — the docs
  "Using UniPty" intro card. The old `contentClass` prop is gone.
- **PressButton variants** renamed: primary/outline →
  fill/tonal/outline/ghost/link. The 0.2.0 local divergence
  ("auto-detect external hrefs, reserve `_blank` for them") is now
  upstream behavior — the registry component does exactly that, so the
  hand patch is retired.
- **scrollbar-measure** is now an explicit lock item imported once in
  the root layout (`import '$lib/scrollbar-measure'`) per the skill
  law. The 0.2.0-era site never imported it (the task brief's
  "still imported" was aspirational); this sync adds it.
- **app.css trimmed.** 0.3.0's jixoai-theme ships the
  popover/destructive/input/ring/shadows token→utility mappings itself
  (the 2026-08-20 pitfall is resolved upstream). app.css keeps chart
  tokens, `--shadow-lg`, readonly-code/tok palettes, the radius reset
  (`--radius-*: initial` — this site deliberately flattens the
  registry's radius scale), and the site surfaces (data tables,
  badges, evidence, readonly code). `utils` (clsx +
  tailwind-merge) moved to devDependencies, keeping the
  zero-runtime-dependency contract.

### AI export layer

The `llms-txt` item is installed at `vite-plugins/llms-txt.mjs`
(package root — the lock-consistent path). ONE generation point: the
final step of `scripts/build.mjs` calls
`generateLlmsTxt(distDir, LLMS_TXT_CONFIG)` (config exported from
build.mjs; `siteUrl: https://unipty.jixoai.com`) — deliberately NOT a
vite plugin, because the orchestrated build owns the dist directory.
Outputs: `dist/llms.txt`, `dist/llms-full.txt`, and per-page `.md`
mirrors (`index.md`, `docs.md`, `compatibility.md`) with provenance
markers. `check-site.mjs` asserts headers/summary/absolute
links/full-file/mirror-count on both fixtures and re-runs the
generator with the same config to prove byte-determinism (cross-build
sha256-identical exports).

- **Deviation (upstream suggestion):** `pageUrlFromRel` maps the flat
  `docs.html` route to `/docs` in `llms.txt` source URLs; the served
  URL is `/docs.html` (GitHub Pages flat artifacts), so `/docs` 404s.
  The `.md` mirrors agents actually consume carry exact links; only
  the index's source-URL column carries the prettified path. Not
  patched locally — the llms-txt law is declared-outputs-only with a
  single generation point; the fix belongs upstream
  (flat-html route support in `pageUrlFromRel`).

## Site i18n — zh mirror (2026-09-06) — `/` en, `/zh/` zh

OpenSpec change `2026-09-06-site-i18n-zh` (original request: 所有站点需要
至少提供中英两种语言的支持). The family-verified pattern from the sibling
sites (dweb et al.) is adopted directly; zh prose is sourced from the
repository `README-zh.md`, never invented.

- **Locale surface.** `/` stays English (URL stability law: the existing
  artifact URLs and the catalog seam are untouched); `/zh/` mirrors the
  three public pages as flat artifacts `zh/index.html`,
  `zh/docs.html`, `zh/compatibility.html` (served `/zh/`, `/zh/docs.html`,
  `/zh/compatibility.html`). Route dirs: `src/routes/zh/+page.svelte`
  (page-level `trailingSlash: 'always'` — the directory-index form is the
  zh canonical URL, so static servers 200 on `/zh/` directly; the root
  layout's `never` governs the en flat routes) plus `.html`-suffixed
  sibling dirs. `svelte.config.js` prerender entries list all six pages.
- **Content architecture.** Prose lives in schema-typed dictionaries
  (`src/lib/i18n/schema.ts`, `locales/en.ts`, `locales/zh.ts`, resolver +
  `localizedPath` in `content.ts`); the three page bodies moved to
  content-driven shared components (`src/lib/pages/{home,docs,
  compatibility}-page.svelte`) and the routes only inject the dictionary +
  locale head. Structural drift between locales is a type error; anchor
  parity is additionally asserted by the check suite.
- **Data is not prose.** Catalog evidence strings, state names, package
  identities, substrates, code samples, and terminal output are
  locale-invariant and live in the shared components / the build-time
  generated presentation — the zh pages render them verbatim. Only
  explanatory prose (hero, sections, legends, table headers, chrome) is
  translated. The docs code samples keep their English comments in both
  locales (code is data; README-zh's translated comments are a README
  affordance, not mirrored here).
- **`<html lang>`.** `app.html` carries a render-time placeholder resolved
  by `src/hooks.server.ts` (`transformPageChunk` + replaceAll — prerendering
  runs through the same handle pipeline). The placeholder literal is
  assembled by concatenation in the hook and never appears in `app.html`
  comments (every occurrence resolves; a stray literal in a comment would
  be rewritten too).
- **hreflang / canonical.** Every page declares canonical +
  `hreflang` en/zh/x-default alternates against `SITE_URL`
  (`https://unipty.jixoai.com`, added to `constants.ts`); zh pages point
  x-default at the en counterpart. Served URLs (`/docs.html` flat form,
  `/zh/` index form) are used, matching the hreflang caveat below.
- **Language switcher.** Registry `language-switcher` (pair variant) rides
  the header switcher slot next to the theme toggle; switching preserves
  the current page AND anchor (`localizedPath` + a `hashchange`-synced
  hash — anchor ids are locale-invariant by construction). Nav
  labels/hrefs, subtitle, toc title, and footer copy are locale-scoped.
- **Registry add trap, hit twice.** `npx jixoai-ui add language-switcher`
  under piped stdin prompts to overwrite each EXISTING dependency file
  (`jixoai.css`, then `utils.ts`…) and each prompt cancels the whole write
  phase while the lock still records the item — locked-but-not-installed.
  Mitigation that finally landed the files: move the item's full dependency
  closure (`utils`, `jixoai-theme`, `icons`, `defaults` — see the item's
  `registryDependencies`) aside, re-add, then restore the committed bytes.
  The CLI's fresh `jixoai.css` write is registry-formatted (single quotes)
  and was replaced back with the committed prettier-formatted bytes;
  pre-existing lock-vs-disk hash divergence on those shared items
  (registry hash recorded, prettier bytes on disk) predates this change
  and is unchanged. `language-switcher`'s own three files are byte-locked.
- **AI export.** `LLMS_TXT_CONFIG` gains `locale: { segments: ["zh"],
  default: "en" }` (build.mjs orchestration point, siteUrl unchanged).
  Outputs per build: `llms.txt` (en index + an "Other languages" entry
  linking the zh edition), `zh/llms.txt` (zh index), `llms-full.txt`
  (default locale only — a mixed-language dump defeats retrieval), and six
  per-page `.md` mirrors including `zh/*.md`. Cross-build byte-identity
  verified for all nine export files; `check-site.mjs` re-proves it per
  fixture. The known flat-`.html`-route caveat (`pageUrlFromRel` strips
  the extension in llms.txt source URLs) now applies per locale
  (`/zh/docs` for the served `/zh/docs.html`) — still upstream's to fix.
- **Check suite.** `check-site.mjs` now expects 6 pages, runs the
  three-state + evidence-string assertions against BOTH compatibility
  pages, adds a locale-surface check (per-page lang attribute, hreflang
  alternates, switcher wiring, CJK titles on zh / none on en, en↔zh
  anchor-id parity), counts mirrors by dist-relative path (basename
  matching would alias `index.md` with `zh/index.md`), asserts `zh/
  llms.txt` exists and is linked, and keeps llms-full en-only (no CJK
  after the first page separator — the index header may link the zh
  edition). CNAME-gate export list covers both locales.

## Locale negotiation (2026-09-06 locale-negotiation)

OpenSpec change `2026-09-06-locale-negotiation` (original request:
站点没有基于浏览器语言自动选择默认语言——需要补上; the sibling
jixoai.com change landed the same day). A zh browser landing on `/`
previously got English unless it clicked the switcher.

- **Pre-paint bootstrap** (`src/app.html`, first inline `<head>`
  script, before the theme bootstrap): an explicit persisted choice
  wins — localStorage `lang` (the switcher's key) equal to `zh`
  redirects ONCE to the same page under `/zh/` (`location.replace`,
  path + hash preserved — flat artifacts mean the prefix simply
  prepends, `/docs.html` → `/zh/docs.html`), while a stored `en` is an
  explicit stay and suppresses detection too (caught live by the
  matrix's first run: the naive reading let stored-en fall through to
  detection and bounced a zh browser to `/zh/`). Otherwise
  `navigator.languages` is walked in order, primary subtag only
  (`zh-Hant-TW` → zh; `pt-BR` → no match, next entry); a zh hit wins.
  Loop laws: the script only ever LEAVES the default surface (returns
  when the first path segment is `zh`), the target always carries the
  `/zh` prefix, and the mirror never bounces back. No match → stay on
  en (x-default; hreflang already advertises the mirror, SEO
  untouched). Storage access is try/caught (private mode degrades to
  detection). SPA note: the bootstrap runs on full document loads
  only — client-side navigations (the tab-carousel router) never
  re-trigger it, so clicking EN mid-session sticks.
- **Switcher persistence** (`language-switcher.svelte`, both
  variants): every locale anchor records its code to localStorage
  `lang` before the anchored navigation, so an explicit click always
  beats detection afterwards; storage failures are swallowed (the
  anchor still navigates). CONVERGED 2026-09-06 (consumer-feedback-fixes
  P0-2 upgrade): the registry item now ships this persistence contract
  itself, so the former site-level divergence (local persist handlers
  over pristine registry bytes) is retired — the file is registry canon
  again and `jixoai-ui.lock` matches it exactly.
- **Check suite**: `checkLocales` additionally asserts the negotiation
  bootstrap ships on every page (probes `navigator.languages` in the
  output html — the inline script is emitted verbatim by the
  prerender pipeline); header (h) documents it.
- **Verification**: check suite green across both fixtures and both
  CNAME modes (incl. the new assertion); headless matrix
  (playwright-core, machine-cached Chromium for Testing 151, dev
  server on 13502 + `dist/` static server) with emulated
  `navigator.languages` + seeded `lang` — zh-CN/zh-Hant-TW → `/zh/`,
  en-US/pt-BR stay, `fr-FR,zh-CN` list walk → `/zh/`, persisted zh
  honored, persisted en beats zh detection, mirror-never-bounces,
  `/docs.html` → `/zh/docs.html`, plus a real-click pair-variant
  switcher test (click 中文 → `lang=zh`, lands `/zh/`) — 30/30 across
  both sites after the stored-en fix.

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
  validate catalog, run the static build (six pages: three en + three zh
  mirrors), byte-identical copy to `dist/catalog/catalog.json` (sha256
  logged), publish the stylesheet, write `dist/CNAME` only when
  `WWW_CNAME=1`, then generate the AI export (`llms.txt` + `zh/llms.txt` +
  `llms-full.txt` + per-page `.md` mirrors in both locales, see the 0.3.0
  sync and i18n sections).
- `node scripts/check-site.mjs` (or `pnpm --filter @unipty/www run test`) —
  clean-build from both committed fixtures and run the static checks
  (links incl. zh mirrors, catalog byte-identity, three-state rendering on
  both compatibility pages, locale surface, no browser backend imports,
  responsive smoke, CNAME gate, llms-txt export shape + byte-determinism).

Catalog input selection: CLI arg > `WWW_CATALOG` env > committed
development fixture `fixtures/catalog.dev.json`.

## Upstream consumer-feedback-fixes consumption (2026-09-06)

- `npx jixoai-ui upgrade` (registry ui.jixoai.com): updated 8 /
  unchanged 66 / skipped 3. Updated: `theme-toggle`, `hero-section`,
  `jixoai-theme`, `defaults`, `context-plugin`, `scrollbar-measure`,
  `press-button`, `language-switcher`. Lock 27 → 27; hue re-applied
  165 (verified `--brand-hue: 165`).
- Divergence convergence (the headline for this site): the
  language-switcher persistence hack — historically maintained HERE as
  a site-level patch over pristine registry bytes (see the retired
  note above) — is now upstream canon (P0-2: click →
  `localStorage.lang`, try/catch silent, pure anchor navigation). The
  upgrade replaced the local patch with canon; no layout hack ever
  existed on this site (persistence always lived in the component), so
  nothing was deleted — the patched-vs-canon drift simply closed.
- `jixoai.css` came back registry-formatted (single quotes): the
  committed bytes had been prettier-reformatted post-0.3.0-sync (fmt
  pass 7f5bf94). The rewrite is formatting-equivalent (`git diff -w`
  shows only the hue-comment context fix beyond whitespace/quotes);
  hue 165 intact. The prettier-formatting lock-vs-disk drift on the
  shared items NOT touched this run (~38 files: barrels, css, defaults
  siblings) predates this change (documented 2026-09-06 site-i18n-zh)
  and is left as-is — cosmetic only, and check-site has no fmt gate.
- `theme-toggle` optional `labels` prop not consumed: site uses
  `variant="compact"` (icon-only), English defaults fine.
- Verification: `node scripts/check-site.mjs` ALL GREEN across both
  fixtures (catalog.dev + catalog.alt) + the CNAME-gate production
  build — links, states, locales (lang/hreflang/switcher wired/
  negotiation bootstrap/en-zh anchors identical), llms export
  byte-identity, malformed-catalog rejection. Playwright headless dev
  spot check (port 13504): click 中文 → `lang=zh` + `/zh/`, reload
  stays zh (`<html lang="zh">`), click EN → `lang=en` + `/`, reload
  stays en — 6/6 (one script race on the EN click was root-caused to
  `networkidle` resolving before the anchor navigation and fixed with
  `waitForURL`; a manual probe confirmed the site behavior was always
  correct).
