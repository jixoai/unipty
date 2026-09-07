// Orthogonal intents (maintained 2026-09-06 Asia/Shanghai): site i18n (en/zh)
// type contract. Both locale dictionaries share ONE schema — the pages render
// from content objects, so structural drift between locales is a type error.
//
// Original request (2026-09-06 Asia/Shanghai): openspec/changes/
// 2026-09-06-site-i18n-zh — `/` stays English (stable URLs), `/zh/` mirrors
// the three public pages; zh copy source is README-zh.md, never invented.
// Catalog evidence strings, code samples, terminal output, and technical
// identity strings (package names, substrates, state names) are ARTIFACT
// DATA, not prose — they stay byte-identical across locales and live in the
// shared page components, never in these dictionaries.
//
// Anchor ids (feature rows, docs sections, toc nodes) are locale-INVARIANT:
// the language switcher preserves the current hash across locales, and
// check-site.mjs asserts id parity between en/zh counterpart pages.

/** Shared page-level types (kept here so routes and pages import one module). */

export interface TocNode {
  /** anchor id — identical across locales */
  id: string;
  label: string;
  children?: TocNode[];
}

export interface NavEntry {
  /** site path within the locale (e.g. '/docs.html'); anchors not allowed */
  href: string;
  label: string;
}

/* ------------------------------------------------------------------ */
/* Layout chrome                                                       */
/* ------------------------------------------------------------------ */

export interface ChromeContent {
  /** header brand block third line (desktop tier) */
  subtitle: string;
  /** language-switcher aria-label */
  languageLabel: string;
  /** the header nav entries (labels only differ; hrefs are locale-scoped) */
  nav: readonly NavEntry[];
  /** the docs rail label (registry Toc `title`) */
  tocTitle: string;
  /** mobile drawer nav aria-label */
  drawerLabel: string;
  footer: {
    projectTitle: string;
    githubLabel: string;
    evidenceTitle: string;
    /** the byte-identical catalog copy link text */
    catalogLabel: string;
  };
}

/* ------------------------------------------------------------------ */
/* Home page                                                           */
/* ------------------------------------------------------------------ */

export interface HomeFeature {
  /** anchor id — identical across locales */
  id: string;
  title: string;
  body: string;
}

export interface HomeRoute {
  /** package name — verbatim data, both locales */
  pkg: string;
  runtime: string;
  substrate: string;
  notes: string;
}

export interface HomeContent {
  meta: { title: string; description: string };
  hero: {
    eyebrow: string;
    /** title renders as lead + <em>em</em> + tail */
    titleLead: string;
    titleEm: string;
    titleTail: string;
    badges: readonly string[];
    summary: string;
    docsLabel: string;
    githubLabel: string;
    copyLabel: string;
  };
  quickStart: {
    eyebrow: string;
    title: string;
    summary: string;
    /** sentence around the docs link: [lead]link[tail] */
    noteLead: string;
    noteLink: string;
    noteTail: string;
  };
  featuresHeading: string;
  features: readonly HomeFeature[];
  routes: {
    eyebrow: string;
    title: string;
    summary: string;
    headers: readonly [string, string, string, string];
    rows: readonly HomeRoute[];
    /** sentence around the compatibility link: [lead]link[tail] */
    ctaLead: string;
    ctaLink: string;
    ctaTail: string;
  };
}

/* ------------------------------------------------------------------ */
/* Docs page                                                           */
/* ------------------------------------------------------------------ */

export interface DocsCard {
  title: string;
  body: string;
}

export interface DocsSection {
  /** anchor id — identical across locales */
  id: string;
  title: string;
  body?: string;
}

export interface InstallRow {
  runtime: string;
  /** verbatim install command — data, not prose */
  command: string;
  engine: string;
}

export interface CapabilityRow {
  capability: string;
  nodePty: string;
  zigpty: string;
  bun: string;
  deno: string;
  notes: string;
}

export interface DocsContent {
  meta: { title: string; description: string };
  overview: { eyebrow: string; title: string; summary: string };
  architecture: readonly DocsCard[];
  install: {
    eyebrow: string;
    title: string;
    summary: string;
    headers: readonly [string, string, string];
    rows: readonly InstallRow[];
    /** sentence fragments around the engine-swap sample: [lead]code[tail] */
    swapLead: string;
    swapTail: string;
  };
  core: {
    eyebrow: string;
    title: string;
    summary: string;
    sections: readonly DocsSection[];
  };
  acquisition: {
    eyebrow: string;
    title: string;
    summary: string;
    sections: readonly DocsSection[];
  };
  routes: {
    eyebrow: string;
    title: string;
    summary: string;
    headers: readonly [string, string, string, string];
    rows: readonly HomeRoute[];
    capabilities: {
      /** sub-heading inside the routes family */
      title: string;
      summary: string;
      headers: readonly [string, string, string, string, string, string];
      rows: readonly CapabilityRow[];
      /** closing note (exec-failure observation applies to every route) */
      closing: string;
    };
  };
  metadata: {
    eyebrow: string;
    title: string;
    summary: string;
    /** target-tokens paragraph (the metadata-schema region is code-only) */
    targets: string;
  };
  browserLimits: {
    eyebrow: string;
    title: string;
    summary: string;
    limits: readonly string[];
    closing: string;
  };
  /** the reading-rail tree; ids identical across locales */
  toc: readonly TocNode[];
}

/* ------------------------------------------------------------------ */
/* Compatibility page                                                  */
/* ------------------------------------------------------------------ */

export interface CompatibilityContent {
  meta: { title: string; description: string };
  hero: {
    eyebrow: string;
    title: string;
    summary: string;
    navLabel: string;
  };
  states: {
    eyebrow: string;
    title: string;
    /** keyed by the verbatim catalog state names (data, not prose) */
    legend: Record<"verified" | "declared-unverified" | "not-targeted", string>;
  };
  release: {
    eyebrow: string;
    title: string;
    labels: {
      release: string;
      commit: string;
      verifiedAt: string;
      sha256: string;
      artifact: string;
    };
    /** artifact line parts around the byte count: [open]N bytes[close] */
    artifactOpen: string;
    artifactClose: string;
    fallbackGeneratedAt: string;
  };
  table: {
    headers: readonly [string, string, string, string, string, string];
    noEvidence: string;
  };
}

/* ------------------------------------------------------------------ */
/* Whole-site bundle                                                   */
/* ------------------------------------------------------------------ */

export interface SiteContent {
  chrome: ChromeContent;
  home: HomeContent;
  docs: DocsContent;
  compatibility: CompatibilityContent;
}
