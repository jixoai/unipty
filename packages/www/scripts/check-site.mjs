#!/usr/bin/env node
/**
 * UniPty website automated static checks (task 8.5).
 *
 * For each input catalog (default: both committed fixtures):
 *   (a) build succeeds from a clean dist;
 *   (b) dist/catalog/catalog.json is byte-identical to the input artifact;
 *   (c) every internal link target (file + anchor) exists — en pages AND
 *       the /zh/ mirrors (2026-09-06 site-i18n-zh);
 *   (d) BOTH compatibility pages (en + zh) render exactly the three catalog
 *       states with per-row evidence strings derived from THIS catalog — no
 *       fourth state, no stale content from another catalog, verbatim
 *       evidence strings in the zh mirror too (artifact data, not prose);
 *   (e) no forbidden dynamic backend imports: no script tag or shipped JS
 *       imports/loads any `@unipty/*` or `unipty` module in the browser;
 *   (f) responsive smoke: viewport meta, scroll-wrapped tables, no large
 *       fixed widths;
 *   (g) AI export layer (jixoai-ui 0.3.0, 2026-09-06): llms.txt with
 *       absolute-URL entries, llms-full.txt, one provenance-marked .md
 *       mirror per published page in BOTH locales (zh mirrors under
 *       dist/zh/), the zh edition index zh/llms.txt linked from the root
 *       index, and a byte-identical regeneration;
 *   (h) locale surface (2026-09-06 site-i18n-zh): per-page <html lang>
 *       matches the route locale, hreflang en/zh/x-default alternates on
 *       every page, the language switcher is wired (its links resolve via
 *       check c), anchor-id sets are identical between en/zh counterpart
 *       pages, and zh pages carry Chinese prose titles; plus the pre-paint
 *       locale negotiation bootstrap ships on every page (2026-09-06
 *       locale-negotiation).
 * Plus: malformed catalogs are rejected, and the CNAME file appears only
 * for production builds (WWW_CNAME=1).
 *
 * Exit code is non-zero on any failure. This is preparation evidence, not
 * visual acceptance.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BuildError, LLMS_TXT_CONFIG, runBuild } from "./build.mjs";
import { derivePresentation, STATES } from "./lib/catalog.mjs";
import { generateLlmsTxt } from "../vite-plugins/llms-txt.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(packageRoot, "dist");
const fixtures = [
  path.join(packageRoot, "fixtures", "catalog.dev.json"),
  path.join(packageRoot, "fixtures", "catalog.alt.json"),
];

const failures = [];
const fail = (message) => failures.push(message);

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const countMatches = (text, regex) => [...text.matchAll(regex)].length;

/* --------------------------------------------------------------------- */

function checkCatalogCopy(catalogPath) {
  const input = readFileSync(catalogPath);
  const copied = readFileSync(path.join(distDir, "catalog", "catalog.json"));
  if (!input.equals(copied)) {
    fail(`catalog copy is not byte-identical to ${catalogPath}`);
    return;
  }
  const inputHash = sha256(input);
  const copyHash = sha256(copied);
  if (inputHash !== copyHash) {
    fail(`catalog sha256 mismatch: ${inputHash} vs ${copyHash}`);
  }
  console.log(`    byte-identical catalog: ${inputHash} (${input.length} bytes)`);
}

function checkLinks(pages) {
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|mailto:|data:|javascript:)/i.test(ref) || ref === "" || ref === "#") {
        continue;
      }
      const [rawPath, frag] = ref.split("#");
      let target;
      if (rawPath === "") {
        target = page;
      } else if (rawPath.startsWith("/")) {
        target = path.join(distDir, rawPath.slice(1));
      } else {
        target = path.resolve(path.dirname(page), rawPath);
      }
      if (!existsSync(target)) {
        fail(`${path.basename(page)}: broken link target ${ref}`);
        continue;
      }
      if (frag) {
        const targetText = target === page ? html : readFileSync(target, "utf8");
        if (!new Set([...targetText.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])).has(frag)) {
          fail(`${path.basename(page)}: missing anchor #${frag} for ${ref}`);
        }
      }
    }
  }
  console.log("    internal links: all targets and anchors resolve");
}

function checkStates(pages, presentation, catalog) {
  // BOTH locale surfaces of the compatibility page (en + the /zh/ mirror)
  // render from the same build-time catalog — each must carry the exact
  // state tally and verbatim evidence strings (data, not prose).
  const compatPages = pages.filter((page) => page.endsWith("compatibility.html"));
  if (compatPages.length !== 2) {
    fail(`expected 2 compatibility pages (en + zh), found ${compatPages.length}`);
  }
  for (const compat of compatPages) {
    checkStatesPage(compat, presentation, catalog);
  }
}

function checkStatesPage(compat, presentation, catalog) {
  const html = readFileSync(compat, "utf8");

  const actual = [...html.matchAll(/data-state="([^"]+)"/g)].map((m) => m[1]);
  for (const value of new Set(actual)) {
    if (!STATES.includes(value)) {
      fail(`compatibility page renders a fourth state: ${value}`);
    }
  }
  const expectedRows = presentation.routes.flatMap((route) => route.rows.map((row) => row.state));
  const tally = (values) => {
    const map = new Map();
    for (const value of values) {
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return map;
  };
  const expectedTally = tally(expectedRows);
  const actualTally = tally(actual);
  if (expectedTally.size !== actualTally.size) {
    fail(
      `state variety mismatch: expected ${[...expectedTally].join(",")} got ${[...actualTally].join(",")}`,
    );
  }
  for (const [state, count] of expectedTally) {
    if (actualTally.get(state) !== count) {
      fail(
        `state count mismatch for "${state}": expected ${count}, got ${actualTally.get(state) ?? 0}`,
      );
    }
  }
  for (const state of expectedTally.keys()) {
    const badge = new RegExp(`<span class="badge badge-${state}">${state}<\\/span>`);
    if (!badge.test(html)) {
      fail(`compatibility page missing visible label "${state}"`);
    }
  }

  // Per-row evidence fidelity: every evidence record from THIS catalog
  // appears exactly once; nothing from another catalog leaks in.
  const expectedEvidence = catalog.evidence.map((ev) => `${ev.runtime.name} ${ev.runtime.version}`);
  const actualEvidence = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
  const expectedTallyEv = tally(expectedEvidence);
  const actualTallyEv = tally(actualEvidence);
  for (const [key, count] of expectedTallyEv) {
    if (actualTallyEv.get(key) !== count) {
      fail(
        `evidence string "${key}" expected ${count} time(s), found ${actualTallyEv.get(key) ?? 0}`,
      );
    }
  }
  for (const [key, count] of actualTallyEv) {
    if (!expectedTallyEv.has(key)) {
      fail(`unexpected evidence string "${key}" (stale content from another catalog?)`);
    }
  }
  console.log(
    `    states (${path.relative(distDir, compat)}): ${[...expectedTally].map(([s, n]) => `${n} ${s}`).join(", ")}; evidence strings exact`,
  );
}

const FORBIDDEN_JS_PATTERNS = [
  /\bimport\s*\(\s*["'`][^"'`]*unipty/i,
  /\bfrom\s*["'`][^"'`]*unipty/i,
  /\bimport\s+(?:[\w*{},\s]+from\s*)?["'][^"']*unipty/i,
  /\brequire\s*\(\s*["'][^"']*unipty/i,
];

function checkNoBackendImports(pages) {
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      const attrs = match[1];
      const body = match[2];
      const src = /src\s*=\s*"([^"]+)"/.exec(attrs)?.[1];
      if (src && /unipty/i.test(src)) {
        fail(`${path.basename(page)}: script src loads unipty module: ${src}`);
      }
      if (src && body.trim().length > 0) {
        fail(`${path.basename(page)}: script tag has both src and inline code`);
      }
      for (const pattern of FORBIDDEN_JS_PATTERNS) {
        if (pattern.test(body)) {
          fail(
            `${path.basename(page)}: forbidden browser backend import ${pattern} in inline script`,
          );
        }
      }
    }
  }
  const jsDir = path.join(distDir, "assets");
  for (const jsFile of walk(jsDir).filter((f) => f.endsWith(".js"))) {
    const text = readFileSync(jsFile, "utf8");
    for (const pattern of FORBIDDEN_JS_PATTERNS) {
      if (pattern.test(text)) {
        fail(`${path.relative(packageRoot, jsFile)}: forbidden backend import ${pattern}`);
      }
    }
  }
  console.log("    browser imports: no backend/resolver module references in scripts");
}

function checkResponsive(pages) {
  const css = readFileSync(path.join(distDir, "assets", "styles.css"), "utf8");
  if (!/\.table-scroll\s*\{[^}]*overflow-x\s*:\s*auto/.test(css)) {
    fail("styles.css: .table-scroll must provide overflow-x: auto");
  }
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    if (!/<meta name="viewport" content="[^"]*width=device-width/.test(html)) {
      fail(`${path.basename(page)}: missing width=device-width viewport meta`);
    }
    const tables = countMatches(html, /<table\b/g);
    const wrappers = countMatches(html, /class="table-scroll"/g);
    if (tables > wrappers) {
      fail(
        `${path.basename(page)}: ${tables} table(s) but only ${wrappers} table-scroll wrapper(s)`,
      );
    }
    if (/(?:min-)?width\s*:\s*(?:[4-9]\d{2,}|\d{4,})px/.test(html)) {
      fail(`${path.basename(page)}: large fixed pixel width overflows mobile`);
    }
  }
  if (/\bwidth\s*:\s*\d{4,}px/.test(css)) {
    fail("styles.css: fixed pixel width >= 1000px");
  }
  console.log("    responsive smoke: viewport meta, wrapped tables, no fixed overflows");
}

/* --------------------------------------------------------------------- */

const EN_PAGES = ["index.html", "docs.html", "compatibility.html"];
const ZH_PAGES = ["zh/index.html", "zh/docs.html", "zh/compatibility.html"];
const idsOf = (html) => new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
const titleOf = (html) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";

/** Locale surface (check h): per-page lang attribute, hreflang alternates,
 * switcher wiring, en/zh anchor-id parity, and zh prose presence. */
function checkLocales(pages) {
  for (const rel of [...EN_PAGES, ...ZH_PAGES]) {
    const file = path.join(distDir, rel);
    if (!pages.includes(file)) {
      fail(`locale surface is missing the page ${rel}`);
      continue;
    }
    const html = readFileSync(file, "utf8");
    const expectedLang = rel.startsWith("zh/") ? "zh" : "en";

    const lang = /<html lang="([^"]*)"/.exec(html)?.[1];
    if (lang !== expectedLang) {
      fail(`${rel}: expected <html lang="${expectedLang}">, found "${lang}"`);
    }
    for (const alternate of ["en", "zh", "x-default"]) {
      if (!new RegExp(`rel="alternate" hreflang="${alternate}"`).test(html)) {
        fail(`${rel}: missing the hreflang ${alternate} alternate`);
      }
    }
    // the registry language-switcher is wired into the header chrome
    if (!html.includes("data-jx-lang")) {
      fail(`${rel}: the language switcher is not rendered`);
    }
    // the pre-paint locale negotiation bootstrap ships on every page
    // (2026-09-06 locale-negotiation; its own first-segment guard makes
    // it a no-op on the /zh/ mirrors — loop law)
    if (!html.includes("navigator.languages")) {
      fail(`${rel}: the pre-paint locale negotiation bootstrap is missing`);
    }
    // zh pages carry Chinese prose in their <title>, en pages do not
    const zhTitle = /[\u4e00-\u9fff]/.test(titleOf(html));
    if (expectedLang === "zh" ? !zhTitle : zhTitle) {
      fail(`${rel}: the <title> locale does not match the page locale`);
    }
  }

  // Anchor-id parity between en/zh counterpart pages — the language
  // switcher preserves the current anchor across locales, so ids must be
  // locale-invariant (also covers the docs toc tree).
  for (let i = 0; i < EN_PAGES.length; i++) {
    const enIds = idsOf(readFileSync(path.join(distDir, EN_PAGES[i]), "utf8"));
    const zhIds = idsOf(readFileSync(path.join(distDir, ZH_PAGES[i]), "utf8"));
    for (const id of enIds) {
      if (!zhIds.has(id)) fail(`zh/${EN_PAGES[i]}: missing the en anchor id "${id}"`);
    }
    for (const id of zhIds) {
      if (!enIds.has(id)) fail(`${EN_PAGES[i]}: missing the zh anchor id "${id}"`);
    }
  }
  console.log(
    "    locales: lang + hreflang per page, switcher wired, negotiation bootstrap, en/zh anchors identical",
  );
}

const LLMS_SITE_URL = LLMS_TXT_CONFIG.siteUrl;
const MD_MARKER = "<!-- generated by jixoai llms-txt";

/** AI export layer (check g): declared outputs exist, every published page
 * in BOTH locales has exactly one provenance-marked mirror, nothing else
 * gained one, all index links are absolute, the zh edition index is linked
 * from the root index, and a full regeneration is byte-identical. */
function checkLlmsExport(pages) {
  const read = (rel) => readFileSync(path.join(distDir, rel), "utf8");

  const index = read("llms.txt");
  if (!index.startsWith("# UniPty\n")) fail("llms.txt: missing H1 index head");
  if (!/^> .+$/m.test(index.slice(0, index.indexOf("##") > 0 ? index.indexOf("##") : 500))) {
    fail("llms.txt: missing summary blockquote");
  }
  for (const match of index.matchAll(/\]\(([^)]+)\)/g)) {
    if (!match[1].startsWith(`${LLMS_SITE_URL}/`)) {
      fail(`llms.txt: non-absolute entry link ${match[1]}`);
    }
  }

  // the zh edition index exists and the root index links it
  const zhIndex = read("zh/llms.txt");
  if (!zhIndex.startsWith("# UniPty\n")) fail("zh/llms.txt: missing H1 index head");
  for (const match of zhIndex.matchAll(/\]\(([^)]+)\)/g)) {
    if (!match[1].startsWith(`${LLMS_SITE_URL}/zh/`)) {
      fail(`zh/llms.txt: non-absolute or non-zh entry link ${match[1]}`);
    }
  }
  if (!index.includes(`${LLMS_SITE_URL}/zh/llms.txt`)) {
    fail("llms.txt: missing the link to the zh edition index");
  }

  read("llms-full.txt"); // exists + under cap (generation fails over the cap)
  // llms-full follows the default locale only: the index header may link
  // the zh edition (language navigation), but the concatenated PAGE BODIES
  // after the first separator must stay English (no CJK prose).
  const fullText = read("llms-full.txt");
  const firstSep = fullText.indexOf("\n---\n");
  if (firstSep >= 0 && /[\u4e00-\u9fff]/.test(fullText.slice(firstSep))) {
    fail("llms-full.txt: zh page bodies leaked into the default-locale dump");
  }

  // exactly one mirror per published page (dist-relative paths — the zh
  // mirrors live under zh/), every mirror provenance-marked
  const mirrorOf = (page) =>
    path.relative(distDir, page).replace(/\.html$/, ".md").split(path.sep).join("/");
  const expectedMirrors = new Set(pages.map(mirrorOf));
  const actualMirrors = new Set(
    walk(distDir)
      .map((f) => path.relative(distDir, f).split(path.sep).join("/"))
      .filter((f) => f.endsWith(".md")),
  );
  for (const page of pages) {
    const mirror = mirrorOf(page);
    if (!actualMirrors.has(mirror)) {
      fail(`${path.basename(page)}: no .md mirror in the export`);
      continue;
    }
    if (!read(mirror).startsWith(MD_MARKER)) {
      fail(`${mirror}: missing the generated-by provenance marker`);
    }
  }
  for (const extra of actualMirrors) {
    if (!expectedMirrors.has(extra)) {
      fail(`${extra}: mirror exists for a page outside the published surface`);
    }
  }

  // byte-identical regeneration (the llms-txt determinism law) — the SAME
  // config the build used (LLMS_TXT_CONFIG is the single source)
  const before = new Map(
    [...actualMirrors, "llms.txt", "zh/llms.txt", "llms-full.txt"].map((f) => [
      f,
      sha256(read(f)),
    ]),
  );
  generateLlmsTxt(distDir, LLMS_TXT_CONFIG);
  for (const [file, hash] of before) {
    if (sha256(read(file)) !== hash) fail(`${file}: regeneration is not byte-identical`);
  }

  console.log(
    `    llms export: llms.txt + zh/llms.txt + llms-full.txt + ${actualMirrors.size} mirrors, absolute links, byte-identical re-run`,
  );
}

function checkFixture(catalogPath) {
  console.log(`  fixture: ${path.relative(packageRoot, catalogPath)}`);
  let result;
  try {
    result = runBuild(catalogPath, { quiet: true });
  } catch (error) {
    if (error instanceof BuildError) {
      fail(`build failed for ${catalogPath}:\n    ${error.message.split("\n").join("\n    ")}`);
      return;
    }
    throw error;
  }
  const pages = walk(distDir).filter((f) => f.endsWith(".html"));
  if (pages.length !== 6) fail(`expected 6 pages (3 en + 3 zh), built ${pages.length}`);
  checkCatalogCopy(catalogPath);
  checkLinks(pages);
  checkStates(pages, result.presentation, result.catalog);
  checkNoBackendImports(pages);
  checkResponsive(pages);
  checkLocales(pages);
  checkLlmsExport(pages);
}

function checkMalformedRejection() {
  const tmp = mkdtempSync(path.join(tmpdir(), "unipty-www-"));
  const badPath = path.join(tmp, "catalog.bad.json");
  writeFileSync(
    badPath,
    JSON.stringify({
      catalogVersion: 1,
      release: { commit: "" },
      packages: [],
      evidence: [],
    }),
  );
  let rejected = false;
  try {
    runBuild(badPath, { quiet: true });
  } catch (error) {
    rejected = error instanceof BuildError;
  }
  if (!rejected) fail("malformed catalog was not rejected by the build");
  rmSync(tmp, { recursive: true, force: true });
  console.log("  malformed catalog: rejected (exit-non-zero path verified)");
}

function checkCnameGate(lastCatalog) {
  runBuild(lastCatalog, { cname: true, quiet: true });
  const cnamePath = path.join(distDir, "CNAME");
  if (!existsSync(cnamePath)) {
    fail("WWW_CNAME build did not write dist/CNAME");
  } else if (readFileSync(cnamePath, "utf8") !== "unipty.jixoai.com\n") {
    fail("dist/CNAME content is not exactly unipty.jixoai.com");
  }
  // the AI export layer must ship in BOTH modes and BOTH locales (CNAME is
  // not HTML, so the exports themselves are mode-independent)
  for (const exportFile of [
    "llms.txt",
    "zh/llms.txt",
    "llms-full.txt",
    "index.md",
    "docs.md",
    "compatibility.md",
    "zh/index.md",
    "zh/docs.md",
    "zh/compatibility.md",
  ]) {
    if (!existsSync(path.join(distDir, exportFile))) {
      fail(`WWW_CNAME build is missing the AI export ${exportFile}`);
    }
  }
  runBuild(lastCatalog, { quiet: true });
  if (existsSync(cnamePath)) {
    fail("preview build (no WWW_CNAME) must not emit dist/CNAME");
  }
  console.log("  cname gate: production-only, preview stays CNAME-free; exports in both modes");
}

const args = process.argv.slice(2);
const catalogs = args.length > 0 ? args.map((a) => path.resolve(a)) : fixtures;

console.log("unipty www static checks");
checkMalformedRejection();
for (const catalog of catalogs) {
  checkFixture(catalog);
}
if (catalogs.length > 0) {
  checkCnameGate(catalogs[catalogs.length - 1]);
}

if (failures.length > 0) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("\nall static checks passed");
