/**
> Orthogonal intents (2026-08-20): unipty-helper-backend CLI — the `manifest`
 * generation command over the pure programmatic entry.
 *
 * Original request (2026-08-17): one or more repeatable ordered `--candidate`
 * values; exactly one of `--out` or `--stdout`; replacement requires
 * `--force`; diagnostics on stderr only; generated source is the only stdout
 * content. The CLI never infers candidates, scans installations, imports
 * Backend entry modules, installs packages, or initializes native resources.
 */

import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  generateUniPtyBackendManifestModule,
  UniPtyHelperCandidateError,
} from "./generate.ts";

const USAGE = `usage: unipty-helper-backend manifest
  --candidate <packageName>   ordered candidate; repeatable, required (>= 1)
  --out <file>                write the generated module to a file
  --stdout                    write generated source to standard output
  --force                     allow --out to replace an existing file
  --from <dir-or-file-url>    resolution base; defaults to the current directory

Exactly one output mode (--out or --stdout) is required. Diagnostics go to
standard error; standard output carries generated source only.`;

/** Injectable process surface so tests can drive `main()` without side effects. */
export interface CliIo {
  readonly stdout: {
    write(chunk: string): void;
  };
  readonly stderr: {
    write(chunk: string): void;
  };
  readonly exists: (path: string) => boolean;
  readonly writeFile: (path: string, source: string) => void;
  readonly cwd: () => string;
}

const defaultIo: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
  exists: (path) => existsSync(path),
  writeFile: (path, source) => {
    writeFileSync(path, source, "utf8");
  },
  cwd: () => process.cwd(),
};

interface ParsedArguments {
  readonly command: string;
  readonly candidates: string[];
  readonly out?: string;
  readonly stdout: boolean;
  readonly force: boolean;
  readonly from?: string;
}

function parseArguments(argv: readonly string[]): ParsedArguments | Error {
  const [command, ...rest] = argv;
  const parsed: {
    command: string;
    candidates: string[];
    out?: string;
    stdout: boolean;
    force: boolean;
    from?: string;
  } = {
    command: command ?? "",
    candidates: [],
    stdout: false,
    force: false,
  };

  const valueOptions: Record<string, (value: string) => void> = {
    candidate: (value) => {
      parsed.candidates.push(value);
    },
    out: (value) => {
      parsed.out = value;
    },
    from: (value) => {
      parsed.from = value;
    },
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      break;
    }
    if (token === "--stdout") {
      parsed.stdout = true;
      continue;
    }
    if (token === "--force") {
      parsed.force = true;
      continue;
    }
    if (token.startsWith("--")) {
      const equals = token.indexOf("=");
      const inline = equals !== -1;
      const name = inline ? token.slice(2, equals) : token.slice(2);
      const apply = valueOptions[name];
      if (apply === undefined) {
        return new Error(`unknown argument "${token}"`);
      }
      if (inline) {
        apply(token.slice(equals + 1));
        continue;
      }
      const value = rest[index + 1];
      if (value === undefined) {
        return new Error(`${token} requires a value`);
      }
      index += 1;
      apply(value);
      continue;
    }
    return new Error(`unexpected positional argument "${token}"`);
  }
  return parsed;
}

/**
 * CLI entry point. Returns the process exit code: 0 on success, 1 on usage
 * or runtime failure. Diagnostics are written to `io.stderr`; generated
 * source is written to `io.stdout` (or `--out`) and never mixed.
 */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  io: CliIo = defaultIo,
): Promise<number> {
  const parsed = parseArguments(argv);
  if (parsed instanceof Error) {
    io.stderr.write(`${parsed.message}\n${USAGE}\n`);
    return 1;
  }
  if (parsed.command !== "manifest") {
    io.stderr.write(`unknown or missing command "${parsed.command}"\n${USAGE}\n`);
    return 1;
  }
  if (parsed.candidates.length === 0) {
    io.stderr.write(`at least one --candidate is required\n${USAGE}\n`);
    return 1;
  }
  if (parsed.out !== undefined && parsed.stdout) {
    io.stderr.write(`--out and --stdout are mutually exclusive\n${USAGE}\n`);
    return 1;
  }
  if (parsed.out === undefined && !parsed.stdout) {
    io.stderr.write(`exactly one of --out or --stdout is required\n${USAGE}\n`);
    return 1;
  }

  const from = parsed.from ?? io.cwd();

  let source: string;
  try {
    source = await generateUniPtyBackendManifestModule({
      candidates: parsed.candidates,
      from,
    });
  } catch (error) {
    if (error instanceof UniPtyHelperCandidateError) {
      io.stderr.write(
        `error: ${error.message} (code: ${error.code}, candidate: ${error.packageName})\n`,
      );
      return 1;
    }
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "generation-failed";
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`error: ${message} (code: ${code})\n`);
    return 1;
  }

  if (parsed.stdout) {
    io.stdout.write(source);
    return 0;
  }

  const outFile = resolve(io.cwd(), parsed.out as string);
  if (io.exists(outFile) && !parsed.force) {
    io.stderr.write(
      `error: ${outFile} already exists; pass --force to replace it\n`,
    );
    return 1;
  }
  io.writeFile(outFile, source);
  return 0;
}

// Self-execute when invoked as the bin entry. The realpath comparison keeps
// pnpm-style bin symlinks working; the check keeps the module importable
// from tests without side effects.
const invokedAsBin = (() => {
  const argv1 = process.argv[1];
  if (typeof argv1 !== "string" || argv1.length === 0) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
})();

if (invokedAsBin) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
