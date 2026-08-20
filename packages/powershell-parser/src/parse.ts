/**
> Orthogonal intents (2026-08-20): host process orchestration — spawn the
 * explicit PowerShell host, transport the text safely, and map the adapter's
 * JSON onto the public classification result.
 *
 * Original request (2026-08-18): parse through an explicitly selected host
 * (`pwsh` by default), report typed capability failures, and never execute
 * the caller's text.
 */

import { spawn } from "node:child_process";
import { ADAPTER_SCRIPT } from "./adapter-script.ts";
import { PowershellParseError } from "./error.ts";
import type { PowershellParseDiagnostic, PowershellParseResult } from "./result.ts";

export interface PowershellParseOptions {
  /** Host executable; defaults to `pwsh` (PowerShell 7+). */
  readonly host?: string;
  /** Host time budget in milliseconds; defaults to 15000. */
  readonly timeoutMs?: number;
}

const DEFAULT_HOST = "pwsh";
const DEFAULT_TIMEOUT_MS = 15_000;

/** Shape of the adapter's single JSON line on stdout. */
interface AdapterPayload {
  readonly kind?: unknown;
  readonly argv?: unknown;
  readonly diagnostics?: unknown;
  readonly message?: unknown;
}

function encodeCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDiagnostics(value: unknown): PowershellParseDiagnostic[] {
  if (!Array.isArray(value)) return [];
  const diagnostics: PowershellParseDiagnostic[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.message !== "string") continue;
    diagnostics.push({
      message: entry.message,
      ...(typeof entry.errorId === "string" ? { errorId: entry.errorId } : {}),
      ...(entry.incomplete === true ? { incomplete: true } : {}),
      ...(typeof entry.start === "number" &&
      typeof entry.end === "number" &&
      Number.isFinite(entry.start) &&
      Number.isFinite(entry.end)
        ? { range: { start: entry.start, end: entry.end } }
        : {}),
    });
  }
  return diagnostics;
}

function normalizeArgv(value: unknown): readonly string[] | undefined {
  // ConvertTo-Json can collapse a single-element array to a bare string.
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return undefined;
  if (!value.every((entry) => typeof entry === "string")) return undefined;
  return value;
}

function runAdapter(host: string, timeoutMs: number, source: string): Promise<AdapterPayload> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      host,
      [
        "-NoProfile",
        "-NonInteractive",
        "-NoLogo",
        "-EncodedCommand",
        encodeCommand(ADAPTER_SCRIPT),
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          UNIPTY_PARSER_SOURCE_B64: Buffer.from(source, "utf8").toString("base64"),
        },
        windowsHide: true,
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new PowershellParseError("host-timeout", `${host} exceeded ${timeoutMs}ms while parsing`),
      );
    }, timeoutMs);

    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run();
    };

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error: NodeJS.ErrnoException) =>
      finish(() => {
        if (error.code === "ENOENT") {
          reject(
            new PowershellParseError(
              "capability-unavailable",
              `no PowerShell host available at "${host}"; install PowerShell 7+ or pass options.host`,
              { cause: error },
            ),
          );
          return;
        }
        reject(
          new PowershellParseError(
            "host-failure",
            `host "${host}" failed to start: ${error.message}`,
            { cause: error },
          ),
        );
      }),
    );
    child.on("close", (code, signal) =>
      finish(() => {
        const text = Buffer.concat(stdout).toString("utf8").trim();
        if (text === "") {
          const detail = Buffer.concat(stderr).toString("utf8").trim();
          reject(
            new PowershellParseError(
              "host-failure",
              `host "${host}" produced no result (exit ${code ?? "null"}${signal ? `, signal ${signal}` : ""})${detail ? `: ${detail.slice(0, 500)}` : ""}`,
            ),
          );
          return;
        }
        try {
          resolve(JSON.parse(text) as AdapterPayload);
        } catch (cause) {
          reject(
            new PowershellParseError("host-failure", `host "${host}" produced a malformed result`, {
              cause,
            }),
          );
        }
      }),
    );
  });
}

/** Classify PowerShell command text through the official parser; never executes it. */
export async function parsePowershell(
  source: string,
  options: PowershellParseOptions = {},
): Promise<PowershellParseResult> {
  const host = options.host ?? DEFAULT_HOST;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let payload: AdapterPayload;
  try {
    payload = await runAdapter(host, timeoutMs, source);
  } catch (cause) {
    if (cause instanceof PowershellParseError) throw cause;
    throw new PowershellParseError("host-failure", "unexpected host failure", { cause });
  }

  if (isRecord(payload) && payload.kind === "adapter-error") {
    throw new PowershellParseError(
      "host-failure",
      `host adapter failed: ${typeof payload.message === "string" ? payload.message : "unknown error"}`,
    );
  }
  if (!isRecord(payload)) {
    throw new PowershellParseError("host-failure", `host "${host}" produced an unusable result`);
  }

  if (payload.kind === "argv") {
    const argv = normalizeArgv(payload.argv);
    if (argv !== undefined && argv.length > 0) {
      return { kind: "argv", argv };
    }
    throw new PowershellParseError(
      "host-failure",
      `host "${host}" returned an invalid argv payload`,
    );
  }
  if (payload.kind === "incomplete" || payload.kind === "invalid") {
    return { kind: payload.kind, diagnostics: normalizeDiagnostics(payload.diagnostics) };
  }
  // `script` and any unexpected kind keep the explicit-shell-request reading;
  // the caller must accept PowerShell semantics before launching anything.
  return { kind: "script", language: "powershell", source };
}

/** Probe whether a usable PowerShell host exists, without parsing anything. */
export async function isPowershellHostAvailable(host: string = DEFAULT_HOST): Promise<boolean> {
  try {
    await runAdapter(host, 5_000, "probe");
    return true;
  } catch (error) {
    if (error instanceof PowershellParseError && error.code === "capability-unavailable")
      return false;
    // A present-but-misbehaving host is still an available host.
    return true;
  }
}
