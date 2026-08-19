#!/usr/bin/env node
/**
 * UniPty website automated static checks (task 8.5).
 *
 * For each input catalog (default: both committed fixtures):
 *   (a) build succeeds from a clean dist;
 *   (b) dist/catalog/catalog.json is byte-identical to the input artifact;
 *   (c) every internal link target (file + anchor) exists;
 *   (d) the compatibility page renders exactly the three catalog states
 *       with per-row evidence strings derived from THIS catalog — no
 *       fourth state, no stale content from another catalog;
 *   (e) no forbidden dynamic backend imports: no script tag or shipped JS
 *       imports/loads any `@unipty/*` or `unipty` module in the browser;
 *   (f) responsive smoke: viewport meta, scroll-wrapped tables, no large
 *       fixed widths.
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
import { BuildError, runBuild } from "./build.mjs";
import { derivePresentation, STATES } from "./lib/catalog.mjs";

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
  const compat = pages.find((page) => page.endsWith("compatibility.html"));
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
    `    states: ${[...expectedTally].map(([s, n]) => `${n} ${s}`).join(", ")}; evidence strings exact`,
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
  if (pages.length !== 3) fail(`expected 3 pages, built ${pages.length}`);
  checkCatalogCopy(catalogPath);
  checkLinks(pages);
  checkStates(pages, result.presentation, result.catalog);
  checkNoBackendImports(pages);
  checkResponsive(pages);
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
  runBuild(lastCatalog, { quiet: true });
  if (existsSync(cnamePath)) {
    fail("preview build (no WWW_CNAME) must not emit dist/CNAME");
  }
  console.log("  cname gate: production-only, preview stays CNAME-free");
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
