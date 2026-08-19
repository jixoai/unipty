/**
> Orthogonal intents (2026-08-20): execute the conformance profile against
> the packages installed in the isolated consumer directory (task 6.1).
 *
 * Runs the profile runner with the consumer's node_modules as the module
 * resolution root, so `@unipty/backend-*` resolves to the packed artifacts
 * a real consumer installed — the sole acceptance seam for native support.
 * Reports and (on full pass) evidence records land in the workspace
 * packages/conformance/{reports,evidence} for artifact upload.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const route = process.argv[2] ?? "";
const runtime = process.argv[3] ?? "node";
const routes = {
  "node-pty": "node-pty",
  bun: "bun",
  "deno-sigma__pty-ffi": "deno-sigma__pty-ffi",
};
if (!(route in routes)) {
  console.error("usage: node run-installed-profile.mjs <route> <node|bun|deno>");
  process.exit(1);
}

const repoRoot = resolve(new URL("../../../", import.meta.url).pathname);
const installDir = join(repoRoot, ".conformance-install");
const runner = join(installDir, "runners/run-profile.ts");
const conformanceDir = join(repoRoot, "packages/conformance");
mkdirSync(join(conformanceDir, "reports"), { recursive: true });
mkdirSync(join(conformanceDir, "evidence"), { recursive: true });

// Tuple-unique output names: the CI matrix runs one route per OS, and the
// release collector keeps every distinct tuple — a fixed route name would
// silently overwrite a sibling platform's record.
// Reuse the suite's authoritative tuple detection so filename tags and
// evidence tuple identities cannot drift apart.
const { currentTuple } = await import("../src/host.ts");
const tuple = currentTuple();
const tupleSuffix = `${tuple.os}-${tuple.arch}${tuple.libc === undefined ? "" : `-${tuple.libc}`}`;
const reportOut = join(conformanceDir, "reports", `${route}-${tupleSuffix}-report.json`);
const evidenceOut = join(conformanceDir, "evidence", `${route}-${tupleSuffix}-evidence.json`);
const commands = {
  node: [
    "node",
    [
      runner,
      "--backend",
      route,
      "--out",
      reportOut,
      "--emit-evidence",
      "--evidence-out",
      evidenceOut,
    ],
  ],
  bun: [
    "bun",
    [
      runner,
      "--backend",
      route,
      "--out",
      reportOut,
      "--emit-evidence",
      "--evidence-out",
      evidenceOut,
    ],
  ],
  deno: [
    "deno",
    [
      "run",
      "-A",
      "--no-check",
      runner,
      "--backend",
      route,
      "--out",
      reportOut,
      "--emit-evidence",
      "--evidence-out",
      evidenceOut,
    ],
  ],
};
const [command, args] = commands[runtime];
if (command === undefined) {
  console.error(`unsupported runtime ${runtime}`);
  process.exit(1);
}

// cwd = consumer dir so package resolution roots at the installed tarballs;
// report/evidence outputs are written to explicit workspace paths.
execFileSync(command, args, { cwd: installDir, stdio: "inherit" });
