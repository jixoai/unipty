#!/usr/bin/env node
/**
 * UniPty website build — zero-dependency static site assembler.
 *
 * Pipeline (task 8.3):
 *  1. Read the explicitly selected release catalog artifact
 *     (CLI arg > WWW_CATALOG env > committed development fixture).
 *  2. Validate its shape against the release catalog contract; reject
 *     malformed input with a non-zero exit.
 *  3. Copy the artifact UNCHANGED (byte-identical buffer write) into
 *     dist/catalog/catalog.json; log its sha256. Never re-serialize.
 *  4. Render pages from templates with {{TOKEN}} substitution and a tiny
 *     build-time syntax highlighter. The compatibility matrix is fully
 *     pre-rendered here — never computed in the browser.
 *  5. Write dist/CNAME ("unipty.jixoai.com") only when WWW_CNAME=1, so
 *     preview builds stay CNAME-free.
 */

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { derivePresentation, validateCatalog } from "./lib/catalog.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distDir = path.join(packageRoot, "dist");
const defaultCatalog = path.join(packageRoot, "fixtures", "catalog.dev.json");
const siteDir = path.join(packageRoot, "site");
const pages = [
  { template: "index.html", out: "index.html", nav: "INDEX" },
  { template: "docs.html", out: "docs.html", nav: "DOCS" },
  { template: "compatibility.html", out: "compatibility.html", nav: "COMPAT" },
];

export class BuildError extends Error {}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const unescapeHtml = (value) =>
  String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/* Code content lives in element text, not attributes: keep quotes literal
 * so the highlighter can match string tokens. */
const escapeCode = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* --------------------------------------------------------------------- */
/* Build-time syntax highlighting (no shiki dependency)                   */
/* --------------------------------------------------------------------- */

const KEYWORDS = {
  ts: "import|from|export|const|let|var|await|async|for|of|in|if|else|break|continue|new|return|function|type|interface|true|false|null|undefined|void",
  js: "import|from|export|const|let|var|await|async|function|return|true|false|null|undefined",
  json: "true|false|null",
  sh: "",
};

function highlight(code, lang) {
  const escaped = escapeCode(unescapeHtml(code));
  const keywords = KEYWORDS[lang] ?? KEYWORDS.ts;
  const parts = [
    "(\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)", // 1: comments
    "(\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)", // 2: strings
  ];
  if (keywords) parts.push(`\\b(${keywords})\\b`); // 3: keywords
  parts.push("\\b(\\d[\\d_]*(?:\\.\\d+)?)\\b"); // 4: numbers
  const re = new RegExp(parts.join("|"), "g");
  return escaped.replace(re, (match, comment, str, kw, num) => {
    if (comment !== undefined) return `<span class="tok-comment">${match}</span>`;
    if (str !== undefined) return `<span class="tok-string">${match}</span>`;
    if (kw !== undefined) return `<span class="tok-keyword">${match}</span>`;
    if (num !== undefined) return `<span class="tok-number">${match}</span>`;
    return match;
  });
}

const transformCodeBlocks = (html) =>
  html.replace(
    /<pre class="code" data-lang="(\w+)"><code>([\s\S]*?)<\/code><\/pre>/g,
    (_m, lang, code) =>
      `<pre class="code" data-lang="${lang}"><code>${highlight(code, lang)}</code></pre>`,
  );

/* --------------------------------------------------------------------- */
/* Compatibility matrix rendering (build time only)                       */
/* --------------------------------------------------------------------- */

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function renderEvidenceCell(row) {
  if (row.state !== "verified" || row.evidence.length === 0) {
    return (
      `<td><ul class="evidence-list">` +
      `<li><span class="evidence-line">No exact evidence record in this catalog.</span></li>` +
      `</ul></td>`
    );
  }
  const items = row.evidence
    .map((ev) => {
      const report = ev.reportRef
        ? ` · report <code>${escapeHtml(ev.reportRef)}</code>`
        : "";
      return (
        `<li><span class="evidence-line">` +
        `<strong>${escapeHtml(ev.runtimeName)} ${escapeHtml(ev.runtimeVersion)}</strong>` +
        ` · suite ${escapeHtml(ev.suiteId)}@${escapeHtml(ev.suiteVersion)}` +
        ` · commit ${escapeHtml(ev.commit)}` +
        ` · verified ${escapeHtml(ev.verifiedAt)}${report}` +
        `</span></li>`
      );
    })
    .join("");
  return `<td><ul class="evidence-list">${items}</ul></td>`;
}

function renderMatrix(presentation) {
  return presentation.routes
    .map((route) => {
      const provenance = route.provenance
        ? ` · substrate <code>${escapeHtml(route.provenance.substrate)}</code> (${escapeHtml(route.provenance.kind)})`
        : "";
      const rows = route.rows
        .map((row) => {
          const libc = row.tuple.libc ?? "—";
          return (
            `<tr data-state="${row.state}">` +
            `<td class="dim">${row.runtime ? escapeHtml(row.runtime) : "—"}</td>` +
            `<td class="dim">${escapeHtml(row.tuple.os)}</td>` +
            `<td class="dim">${escapeHtml(row.tuple.arch)}</td>` +
            `<td class="dim">${escapeHtml(libc)}</td>` +
            `<td class="state-cell"><span class="badge badge-${row.state}">${row.state}</span></td>` +
            renderEvidenceCell(row) +
            `</tr>`
          );
        })
        .join("\n");
      return (
        `<section class="route" id="route-${slug(route.packageName)}">` +
        `<div class="route-header">` +
        `<h3><code>${escapeHtml(route.packageName)}</code> <span class="version">v${escapeHtml(route.packageVersion)}</span></h3>` +
        `<p class="route-sub">backend <code>${escapeHtml(route.backendId)}</code>` +
        ` · factory <code>${escapeHtml(route.factoryExport)}</code>` +
        ` · Core protocol ${route.protocolCore.map((n) => escapeHtml(String(n))).join(", ")}${provenance}</p>` +
        `</div>` +
        `<div class="table-scroll"><table class="matrix">` +
        `<thead><tr><th>Runtime</th><th>OS</th><th>Arch</th><th>libc</th><th>State</th><th>Evidence (exact records)</th></tr></thead>` +
        `<tbody>\n${rows}\n</tbody>` +
        `</table></div>` +
        `</section>`
      );
    })
    .join("\n");
}

/* --------------------------------------------------------------------- */
/* Template substitution                                                  */
/* --------------------------------------------------------------------- */

const substitute = (template, vars) => {
  const out = template.replace(
    /\{\{([A-Z][A-Z0-9_]*)\}\}/g,
    (match, name) => {
      if (!(name in vars)) {
        throw new BuildError(`template references unknown token ${match}`);
      }
      return vars[name];
    },
  );
  const leftover = out.match(/\{\{[A-Z][A-Z0-9_]*\}\}/);
  if (leftover) throw new BuildError(`unsubstituted token ${leftover[0]}`);
  return out;
};

/* --------------------------------------------------------------------- */
/* Build                                                                  */
/* --------------------------------------------------------------------- */

export function resolveCatalogPath(argv = process.argv, env = process.env) {
  const arg = argv[2];
  if (arg) return path.resolve(arg);
  if (env.WWW_CATALOG) return path.resolve(env.WWW_CATALOG);
  return defaultCatalog;
}

export function runBuild(
  catalogPath,
  { cname = false, quiet = false } = {},
) {
  const log = (...args) => {
    if (!quiet) console.log("[www-build]", ...args);
  };

  // 1-2. Read + validate the catalog artifact.
  let bytes;
  try {
    bytes = readFileSync(catalogPath);
  } catch (error) {
    throw new BuildError(`cannot read catalog ${catalogPath}: ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new BuildError(`catalog is not valid JSON: ${error.message}`);
  }
  const validated = validateCatalog(parsed);
  if (!validated.ok) {
    throw new BuildError(
      `catalog validation failed:\n  ${validated.errors.join("\n  ")}`,
    );
  }
  const presentation = derivePresentation(validated.catalog);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // 3. Clean output, then byte-identical catalog copy (never re-serialized).
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(path.join(distDir, "catalog"), { recursive: true });
  mkdirSync(path.join(distDir, "assets"), { recursive: true });
  writeFileSync(path.join(distDir, "catalog", "catalog.json"), bytes);

  // 4. Render pages.
  const layout = readFileSync(path.join(siteDir, "templates", "layout.html"), "utf8");
  const commonVars = {
    CATALOG_SHA256: sha256,
    CATALOG_SHA256_SHORT: sha256.slice(0, 12),
  };
  const titles = {
    "index.html": {
      TITLE: "Runtime-neutral PTY contract",
      DESCRIPTION:
        "UniPty is the runtime-neutral PTY contract for Node, Bun, and Deno with developer-selectable Backends.",
    },
    "docs.html": {
      TITLE: "Documentation",
      DESCRIPTION:
        "UniPty Core usage, Backend acquisition, official routes, the metadata protocol, and browser-local PTY limits.",
    },
    "compatibility.html": {
      TITLE: "Compatibility",
      DESCRIPTION:
        "Verified, declared-unverified, and not-targeted tuples for the current UniPty release, derived from one immutable catalog artifact.",
    },
  };
  for (const page of pages) {
    const content = readFileSync(path.join(siteDir, "templates", page.template), "utf8");
    const vars = {
      ...commonVars,
      ...titles[page.template],
      NAV_INDEX: page.nav === "INDEX" ? ' class="active"' : "",
      NAV_DOCS: page.nav === "DOCS" ? ' class="active"' : "",
      NAV_COMPAT: page.nav === "COMPAT" ? ' class="active"' : "",
    };
    if (page.template === "compatibility.html") {
      vars.CATALOG_COMMIT = escapeHtml(presentation.release.commit);
      vars.CATALOG_GENERATED_AT = escapeHtml(presentation.release.generatedAt);
      vars.COMPAT_MATRIX = renderMatrix(presentation);
    }
    let html = substitute(layout, { ...vars, CONTENT: substitute(content, vars) });
    html = transformCodeBlocks(html);
    writeFileSync(path.join(distDir, page.out), html);
  }

  // Static assets.
  for (const asset of ["styles.css", "site.js", "icon.svg"]) {
    writeFileSync(
      path.join(distDir, "assets", asset),
      readFileSync(path.join(siteDir, "assets", asset)),
    );
  }

  // 5. CNAME only for production (GitHub Pages custom domain) builds.
  if (cname) {
    writeFileSync(path.join(distDir, "CNAME"), "unipty.jixoai.com\n");
  }

  log(`catalog: ${catalogPath}`);
  log(`catalog sha256: ${sha256} (${bytes.length} bytes, copied unchanged)`);
  log(
    `routes: ${presentation.routes.length} packages, ${validated.catalog.evidence.length} evidence records`,
  );
  log(`pages: ${pages.map((p) => p.out).join(", ")}`);
  log(`cname: ${cname ? "written (unipty.jixoai.com)" : "skipped (preview build)"}`);

  return { distDir, sha256, presentation, catalog: validated.catalog };
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    runBuild(resolveCatalogPath(), {
      cname: process.env.WWW_CNAME === "1",
    });
  } catch (error) {
    console.error(`[www-build] ${error instanceof BuildError ? error.message : error.stack ?? error}`);
    process.exit(1);
  }
}
