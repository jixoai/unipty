#!/usr/bin/env node
/**
 * UniPty website build — SvelteKit static site orchestrator.
 *
 * Pipeline:
 *  1. Read the explicitly selected release catalog artifact
 *     (CLI arg > WWW_CATALOG env > committed development fixture).
 *  2. Validate its shape against the release catalog contract; reject
 *     malformed input with a non-zero exit (BuildError).
 *  3. Write the build-time page data consumed by prerendering
 *     (src/lib/generated/ — gitignored; the compatibility page is fully
 *     pre-rendered from it and never recomputed in the browser).
 *  4. Run `vite build` (SvelteKit + @sveltejs/adapter-static) synchronously
 *     into dist/. The adapter empties dist, so every artifact copy below
 *     happens AFTER the static build.
 *  5. Copy the catalog artifact UNCHANGED (byte-identical buffer write) into
 *     dist/catalog/catalog.json; log its sha256. Never re-serialize.
 *  6. Publish the emitted CSS bundle as dist/assets/styles.css and rewrite
 *     the page stylesheet links to it (the static checks expect that path).
 *  7. Write dist/CNAME ("unipty.jixoai.com") only when WWW_CNAME=1, so
 *     preview builds stay CNAME-free.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { derivePresentation, validateCatalog } from "./lib/catalog.mjs";

const nodeRequire = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(packageRoot, "dist");
const defaultCatalog = path.join(packageRoot, "fixtures", "catalog.dev.json");
const generatedDir = path.join(packageRoot, "src", "lib", "generated");
const pages = ["index.html", "docs.html", "compatibility.html"];

export class BuildError extends Error {}

const walkFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walkFiles(full) : [full];
  });

/** Locate the vite CLI entry inside this workspace's node_modules.
 * vite's exports map hides ./bin/vite.js, so resolve the package root
 * through the exported ./package.json and join the bin path explicitly. */
function resolveViteBin() {
  const packageDir = path.dirname(nodeRequire.resolve("vite/package.json"));
  const bin = path.join(packageDir, "bin", "vite.js");
  if (existsSync(bin)) return bin;
  throw new BuildError(
    "cannot locate the vite binary; run `pnpm install` in the repository root first",
  );
}

function runViteBuild({ quiet }) {
  const viteBin = resolveViteBin();
  const result = spawnSync(process.execPath, [viteBin, "build"], {
    cwd: packageRoot,
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
  if (result.error) {
    throw new BuildError(`cannot start vite: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = `${result.stderr?.toString() ?? ""}\n${result.stdout?.toString() ?? ""}`.trim();
    throw new BuildError(`vite build failed (exit ${result.status}):\n${details.slice(-6000)}`);
  }
}

/**
 * Publish the emitted stylesheet at the path the static checks read
 * (dist/assets/styles.css) and point every page at it. One combined file is
 * a superset of any per-page chunk split, so it stays correct either way.
 * Font/asset references are relative to the chunk's own directory, so they
 * are rewritten to the absolute /_app location before the copy moves.
 */
function publishStylesheet() {
  const assetsDir = path.join(distDir, "_app", "immutable", "assets");
  const cssFiles = walkFiles(path.join(distDir, "_app"))
    .filter((file) => file.endsWith(".css"))
    .sort();
  if (cssFiles.length === 0) {
    throw new BuildError("vite build emitted no stylesheet to publish");
  }
  const bundle = cssFiles
    .map((file) =>
      readFileSync(file, "utf8").replace(/url\(\.\/(?!\/)/g, `url(/_app/immutable/assets/`),
    )
    .join("\n");
  mkdirSync(path.join(distDir, "assets"), { recursive: true });
  writeFileSync(path.join(distDir, "assets", "styles.css"), bundle);
  for (const page of pages) {
    const file = path.join(distDir, page);
    const html = readFileSync(file, "utf8");
    writeFileSync(
      file,
      html.replace(/href="(?:\.\/|\/)_app\/[^"]+\.css"/g, 'href="/assets/styles.css"'),
    );
  }
}

/* --------------------------------------------------------------------- */
/* Build                                                                  */
/* --------------------------------------------------------------------- */

export function resolveCatalogPath(argv = process.argv, env = process.env) {
  const arg = argv[2];
  if (arg) return path.resolve(arg);
  if (env.WWW_CATALOG) return path.resolve(env.WWW_CATALOG);
  return defaultCatalog;
}

export function runBuild(catalogPath, { cname = false, quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log("[www-build]", ...args);
  };

  // 1-2. Read + validate the catalog artifact (before any build work).
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
    throw new BuildError(`catalog validation failed:\n  ${validated.errors.join("\n  ")}`);
  }
  const presentation = derivePresentation(validated.catalog);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // 3. Build-time page data for prerendering (recreated on every build; a
  // fresh checkout runs this script, or `pnpm dev`, before vite needs it).
  rmSync(generatedDir, { recursive: true, force: true });
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(
    path.join(generatedDir, "catalog.json"),
    `${JSON.stringify(presentation, null, 2)}\n`,
  );
  writeFileSync(
    path.join(generatedDir, "release.json"),
    `${JSON.stringify({ sha256, catalogBytes: bytes.length }, null, 2)}\n`,
  );

  // 4. Static site build. adapter-static empties dist itself.
  rmSync(distDir, { recursive: true, force: true });
  runViteBuild({ quiet });
  for (const page of pages) {
    if (!existsSync(path.join(distDir, page))) {
      throw new BuildError(`vite build did not emit ${page} into dist`);
    }
  }

  // 5. Byte-identical catalog copy (never re-serialized) — after the adapter
  // has written dist, so nothing can clean it away.
  mkdirSync(path.join(distDir, "catalog"), { recursive: true });
  writeFileSync(path.join(distDir, "catalog", "catalog.json"), bytes);

  // 6. Stylesheet at the checked path.
  publishStylesheet();

  // 7. CNAME only for production (GitHub Pages custom domain) builds.
  if (cname) {
    writeFileSync(path.join(distDir, "CNAME"), "unipty.jixoai.com\n");
  }

  log(`catalog: ${catalogPath}`);
  log(`catalog sha256: ${sha256} (${bytes.length} bytes, copied unchanged)`);
  log(
    `routes: ${presentation.routes.length} packages, ${validated.catalog.evidence.length} evidence records`,
  );
  log(`pages: ${pages.join(", ")}`);
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
    console.error(
      `[www-build] ${error instanceof BuildError ? error.message : (error.stack ?? error)}`,
    );
    process.exit(1);
  }
}
