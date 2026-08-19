/**
> Orthogonal intents (2026-08-20): collect conformance evidence records and
> metadata snapshots for the exact tested commit (task 7.4).
 *
 * Downloads every conformance artifact whose workflow run tested the given
 * commit, extracts the evidence JSON records (positive-only: failed jobs
> never uploaded any), and snapshots each official Backend's metadata from
 * the built dist. The release aggregation then validates identity, tuple,
 * uniqueness, and route coverage before producing the catalog.
 *
 * Requires the gh CLI with a GITHUB_TOKEN-scoped GITHUB_REPOSITORY env.
 */

import { execFileSync } from "node:child_process";
import { copySync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const commit = process.argv[2];
if (commit === undefined) {
  console.error("usage: node collect-release-evidence.mjs <commit-sha>");
  process.exit(1);
}
const repository = process.env.GITHUB_REPOSITORY ?? "";
if (repository === "") {
  console.error("collect-release-evidence: GITHUB_REPOSITORY is required");
  process.exit(1);
}

const repoRoot = resolve(new URL("../../../", import.meta.url).pathname);
const outEvidence = "/tmp/release-evidence";
const outMetadata = "/tmp/release-metadata";
mkdirSync(outEvidence, { recursive: true });
mkdirSync(outMetadata, { recursive: true });

function gh(args, options = {}) {
  return execFileSync("gh", args, { encoding: "utf8", ...options });
}

// 1. Which CI workflow runs tested this commit?
const runs = JSON.parse(
  gh([
    "run",
    "list",
    "--repo",
    repository,
    "--commit",
    commit,
    "--workflow",
    "CI",
    "--json",
    "databaseId,status,conclusion",
    "--limit",
    "50",
  ]),
);
const successful = new Set(
  runs
    .filter((r) => r.status === "completed" && r.conclusion === "success")
    .map((r) => r.databaseId),
);

// 2. Conformance artifacts from those runs (positive evidence only).
const artifacts = JSON.parse(gh(["api", `repos/${repository}/actions/artifacts?per_page=100`]));
const wanted = artifacts.artifacts.filter(
  (a) => a.name?.startsWith("conformance-") && successful.has(a.workflow_run?.id ?? -1),
);
if (wanted.length === 0) {
  console.error(
    `[collect-release-evidence] no successful conformance artifacts for commit ${commit}; ` +
      "the release gate stays closed — a missing or failed job never becomes a claim",
  );
  process.exit(1);
}
for (const artifact of wanted) {
  const zip = `/tmp/${artifact.name}.zip`;
  execFileSync("sh", ["-c", `gh api ${artifact.archive_download_url} > ${zip}`], {
    stdio: "ignore",
  });
  const dest = `/tmp/${artifact.name}`;
  execFileSync("unzip", ["-o", zip, "-d", dest], { stdio: "ignore" });
  const evidenceDir = join(dest, "packages/conformance/evidence");
  let files = [];
  try {
    files = readdirSync(evidenceDir).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  for (const file of files) {
    copySync(join(evidenceDir, file), join(outEvidence, file));
    console.log(`[collect-release-evidence] evidence ${file}`);
  }
}

// 3. Metadata snapshots from the tested commit's dist (release build).
const routes = {
  node: "backend-node-pty",
  bun: "backend-bun",
  deno: "backend-deno-sigma__pty-ffi",
};
execFileSync("corepack", ["pnpm", "build"], { cwd: repoRoot, stdio: "inherit" });
for (const [key, dir] of Object.entries(routes)) {
  const metadataPath = join(repoRoot, `packages/${dir}/dist/unipty.metadata.js`);
  const metadataUrl = new URL(`file://${metadataPath}`).href;
  const module = await import(metadataUrl);
  writeFileSync(join(outMetadata, `${key}.json`), JSON.stringify(module.default, null, 2));
  console.log(`[collect-release-evidence] metadata ${key}`);
}
console.log(
  `[collect-release-evidence] collected ${readdirSync(outEvidence).length} evidence record(s) for ${commit}`,
);
