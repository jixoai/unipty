/**
> Orthogonal intents (2026-08-20): runtime-neutral UniPty worker for the
> example app — one backend per process, line-delimited JSON over stdio.
 *
 * The example server spawns this file under the runtime matching the chosen
 * backend (`node`, `bun`, or `deno run`), which is the whole point of the
 * demo: the SAME worker source drives all three official routes because the
 * UniPty public contract is runtime-neutral.
 *
 * Wire protocol (stdin ← server, stdout → server, one JSON object per line):
 *   in : {t:"spawn", backend, cols, rows}   create the PTY (must be first)
 *   in : {t:"input", b64}                   write UTF-8 input
 *   in : {t:"resize", cols, rows}           character-cell resize
 *   in : {t:"terminate"} | {t:"close"}
 *   out: {t:"output", b64}                  native PTY bytes
 *   out: {t:"exit", exitCode, signal}       independent exit observation
 *   out: {t:"error", message}
 */

import { UniPty } from "unipty";

const BACKEND_FACTORIES = {
  "node-pty": () => import("@unipty/backend-node-pty").then((m) => m.createNodePtyBackend()),
  bun: () => import("@unipty/backend-bun").then((m) => m.createBunBackend()),
  "deno-sigma__pty-ffi": () =>
    import("@unipty/backend-deno-sigma__pty-ffi").then((m) => m.createDenoSigmaPtyFfiBackend()),
};

const encoder = new TextEncoder();

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function defaultShell() {
  const platform = process.platform;
  if (platform === "win32") return "cmd.exe";
  return process.env.SHELL && process.env.SHELL.length > 0 ? process.env.SHELL : "/bin/sh";
}

async function main() {
  let unipty = null;
  let pty = null;

  const handleSpawn = async (message) => {
    const backendId = message.backend;
    const factory = BACKEND_FACTORIES[backendId];
    if (factory === undefined) {
      send({ t: "error", message: `unknown backend "${String(backendId)}"` });
      return;
    }
    try {
      const backend = await factory();
      unipty = new UniPty({ backend });
      const cols = Number.isInteger(message.cols) && message.cols > 0 ? message.cols : 80;
      const rows = Number.isInteger(message.rows) && message.rows > 0 ? message.rows : 24;
      pty = unipty.spawn([defaultShell()], {
        // The browser terminal IS an xterm-256color-class terminal; report the
        // true capability instead of whatever TERM the server process carries.
        env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
        terminal: { cols, rows },
      });

      // Output pump: native bytes → base64 frames (independent of consumers).
      const reader = pty.stream({ encoding: "bytes" }).getReader();
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          if (value !== undefined && value.byteLength > 0) {
            send({ t: "output", b64: Buffer.from(value).toString("base64") });
          }
        }
      })();

      // Independent exit observation.
      void pty.exited.then((result) => {
        send({ t: "exit", exitCode: result.exitCode, signal: result.signal });
      });
    } catch (error) {
      send({ t: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  let buffer = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim() === "") continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.t === "spawn") {
        await handleSpawn(message);
      } else if (pty !== null) {
        try {
          if (message.t === "input") {
            pty.write(Buffer.from(message.b64, "base64"));
          } else if (message.t === "resize") {
            pty.resize(message.cols, message.rows);
          } else if (message.t === "terminate") {
            pty.terminate();
          } else if (message.t === "close") {
            pty.close();
          }
        } catch (error) {
          send({
            t: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
  // stdin closed: tear the PTY down (exit observation already reported).
  if (pty !== null) {
    try {
      pty.terminate();
      pty.close();
    } catch {
      // already torn down
    }
  }
}

void main();
