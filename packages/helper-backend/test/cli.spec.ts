/**
> Orthogonal intents (2026-08-20): helper CLI conformance — ordered
 * candidates, output-mode exclusivity, overwrite protection, stdout/stderr
 * separation, and the cwd fallback for --from.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main } from "../src/index.ts";
import { CONSUMER_ROOT } from "./setup.ts";

const CLI_DIST = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: readonly string[], cwd = CONSUMER_ROOT): CliResult {
  const result = spawnSync(process.execPath, [CLI_DIST, ...args], {
    encoding: "utf8",
    cwd,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function scratchDir(name: string): string {
  const dir = join(tmpdir(), `unipty-helper-cli-${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("unipty-helper-backend manifest (built dist)", () => {
  it("emits only generated source on stdout with clean stderr", () => {
    const result = runCli(["manifest", "--candidate", "@fixture/good-a", "--stdout"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain('import metadata0 from "@fixture/good-a/unipty.metadata"');
    expect(result.stdout).toContain("export default defineUniPtyBackendManifest({");
    expect(result.stdout.endsWith("\n")).toBe(true);
  });

  it("preserves --candidate declaration order", () => {
    const result = runCli([
      "manifest",
      "--candidate",
      "@fixture/good-b",
      "--candidate",
      "@fixture/good-a",
      "--stdout",
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout.indexOf('import metadata0 from "@fixture/good-b')).toBeLessThan(
      result.stdout.indexOf('import metadata1 from "@fixture/good-a'),
    );
    expect(result.stdout.indexOf('packageName: "@fixture/good-b"')).toBeLessThan(
      result.stdout.indexOf('packageName: "@fixture/good-a"'),
    );
  });

  it("defaults --from to the current working directory", () => {
    const result = runCli(["manifest", "--candidate", "@fixture/good-a", "--stdout"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("@fixture/good-a");
  });

  it("honors an explicit --from from an unrelated working directory", () => {
    const elsewhere = scratchDir("elsewhere");
    const result = runCli(
      ["manifest", "--candidate", "@fixture/good-a", "--stdout", "--from", CONSUMER_ROOT],
      elsewhere,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("@fixture/good-a");
    rmSync(elsewhere, { recursive: true, force: true });
  });

  it("rejects a candidate that cannot be resolved with a stderr diagnostic", () => {
    const result = runCli(["manifest", "--candidate", "@fixture/does-not-exist", "--stdout"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("candidate-unresolved");
    expect(result.stderr).toContain("@fixture/does-not-exist");
  });

  it("writes the module to --out and refuses overwrite without --force", () => {
    const dir = scratchDir("out-mode");
    const outFile = join(dir, "backend.manifest.mjs");

    const first = runCli(["manifest", "--candidate", "@fixture/good-a", "--out", outFile]);
    expect(first.status).toBe(0);
    expect(first.stdout).toBe("");
    expect(existsSync(outFile)).toBe(true);
    const written = readFileSync(outFile, "utf8");
    expect(written).toContain('packageName: "@fixture/good-a"');

    // Without --force an existing file is never replaced.
    const second = runCli(["manifest", "--candidate", "@fixture/good-b", "--out", outFile]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("--force");
    expect(readFileSync(outFile, "utf8")).toBe(written);

    // With --force the file is replaced.
    const third = runCli([
      "manifest",
      "--candidate",
      "@fixture/good-b",
      "--out",
      outFile,
      "--force",
    ]);
    expect(third.status).toBe(0);
    expect(readFileSync(outFile, "utf8")).toContain('packageName: "@fixture/good-b"');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("unipty-helper-backend manifest (usage errors)", () => {
  it("fails without a subcommand or --candidate", () => {
    const result = runCli([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("usage:");
  });

  it("fails when --out and --stdout are combined", () => {
    const result = runCli([
      "manifest",
      "--candidate",
      "@fixture/good-a",
      "--out",
      join(scratchDir("unused"), "x.mjs"),
      "--stdout",
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("mutually exclusive");
  });

  it("fails when neither --out nor --stdout is supplied", () => {
    const result = runCli(["manifest", "--candidate", "@fixture/good-a"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--out");
  });

  it("fails for unknown subcommands and unknown flags", () => {
    expect(runCli(["generate", "--stdout"]).status).toBe(1);
    expect(
      runCli(["manifest", "--candidate", "@fixture/good-a", "--stdout", "--bogus"]).status,
    ).toBe(1);
  });
});

describe("main() with injected io", () => {
  function fakeIo() {
    const state = {
      stdoutChunks: [] as string[],
      stderrChunks: [] as string[],
      files: new Map<string, string>(),
    };
    const io = {
      stdout: {
        write: (chunk: string) => {
          state.stdoutChunks.push(chunk);
        },
      },
      stderr: {
        write: (chunk: string) => {
          state.stderrChunks.push(chunk);
        },
      },
      exists: (path: string) => state.files.has(path),
      writeFile: (path: string, source: string) => {
        state.files.set(path, source);
      },
      cwd: () => CONSUMER_ROOT,
    };
    return { io, state };
  }

  it("routes generated source to stdout and diagnostics to stderr", async () => {
    const { io, state } = fakeIo();
    const code = await main(["manifest", "--candidate", "@fixture/good-a", "--stdout"], io);
    expect(code).toBe(0);
    expect(state.stdoutChunks.join("")).toContain("defineUniPtyBackendManifest");
    expect(state.stderrChunks).toEqual([]);
  });

  it("keeps stdout clean on candidate failures", async () => {
    const { io, state } = fakeIo();
    const code = await main(["manifest", "--candidate", "@fixture/nope", "--stdout"], io);
    expect(code).toBe(1);
    expect(state.stdoutChunks).toEqual([]);
    expect(state.stderrChunks.join("")).toContain("candidate-unresolved");
  });

  it("protects existing --out targets without --force", async () => {
    const { io, state } = fakeIo();
    state.files.set("/out/manifest.mjs", "previous");
    const code = await main(
      ["manifest", "--candidate", "@fixture/good-a", "--out", "/out/manifest.mjs"],
      io,
    );
    expect(code).toBe(1);
    expect(state.files.get("/out/manifest.mjs")).toBe("previous");

    const forced = await main(
      ["manifest", "--candidate", "@fixture/good-a", "--out", "/out/manifest.mjs", "--force"],
      io,
    );
    expect(forced).toBe(0);
    expect(state.files.get("/out/manifest.mjs")).toContain("defineUniPtyBackendManifest");
  });
});
