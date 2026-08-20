/**
> Orthogonal intents (2026-08-20): example server — Bun.serve static
> frontend + WebSocket bridge that hosts one UniPty worker process per
> connection, launched under the runtime matching the chosen backend.
 *
 * Original request (2026-08-20): `pnpm example` boots this server; adding a
 * tab picks a backend and the terminal talks over a WebSocket. The routing
 * table below is the demo's core: node-pty → node worker, bun → bun worker,
 * deno-sigma__pty-ffi → deno worker. Every worker is the same runtime-neutral
 * source (workers/pty-worker.mjs); only the hosting runtime differs.
 *
 * WS wire protocol (mirrors the frontend TerminalPane):
 * - binary frames      → PTY bytes both ways
 * - text frames (JSON) → control: {t:"resize",cols,rows} (client→server),
 *                        {t:"exit"|"error",...} (server→client)
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 5176);
const ROOT = import.meta.dirname;
const DIST = join(ROOT, "dist");
const WORKER = join(ROOT, "workers", "pty-worker.mjs");

/** Backend → the runtime executable that must host its worker. */
const RUNTIME_FOR_BACKEND: Record<string, { command: string; args: string[] }> = {
  "node-pty": { command: "node", args: [WORKER] },
  bun: { command: "bun", args: [WORKER] },
  "deno-sigma__pty-ffi": { command: "deno", args: ["run", "-A", "--no-check", WORKER] },
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function serveStatic(request: Request): Response | null {
  if (request.method !== "GET") return null;
  let path = new URL(request.url).pathname;
  if (path === "/") path = "/index.html";
  let file = join(DIST, path);
  // Prevent path escapes; only serve files inside dist.
  if (!file.startsWith(DIST)) return new Response("Not found", { status: 404 });
  if (!existsSync(file)) {
    // SPA-style fallback for non-asset paths.
    if (!path.includes(".")) file = join(DIST, "index.html");
    else return new Response("Not found", { status: 404 });
  }
  const bytes = Bun.file(file);
  const extension = file.slice(file.lastIndexOf("."));
  return new Response(bytes, {
    headers: { "content-type": MIME[extension] ?? "application/octet-stream" },
  });
}

interface WsSession {
  handleMessage(data: string | ArrayBuffer): void;
  handleClose(): void;
}

const sessions = new Map<WebSocket, WsSession>();

/** Launch one UniPty worker under the backend's runtime and bridge it to the WS. */
function createSession(ws: WebSocket, backendId: string): WsSession {
  const runtime = RUNTIME_FOR_BACKEND[backendId];
  const fail = (message: string): WsSession => {
    ws.send(JSON.stringify({ t: "error", message }));
    ws.close();
    return { handleMessage: () => {}, handleClose: () => {} };
  };
  if (runtime === undefined) {
    return fail(`unknown backend "${backendId}"`);
  }
  const executable = Bun.which(runtime.command);
  if (executable === null) {
    return fail(
      `runtime "${runtime.command}" is not installed on this machine (required by backend "${backendId}")`,
    );
  }

  const worker = Bun.spawn([executable, ...runtime.args], {
    cwd: ROOT,
    stdin: "pipe",
    stdout: "pipe",
    // Worker diagnostics go to the server console, never the terminal.
    stderr: "inherit",
  });

  let workerClosed = false;
  let wsClosed = false;
  const finishWorker = (): void => {
    if (workerClosed) return;
    workerClosed = true;
    try {
      worker.stdin.write(`${JSON.stringify({ t: "close" })}\n`);
      worker.stdin.end();
    } catch {
      // already gone
    }
    setTimeout(() => {
      try {
        worker.kill();
      } catch {
        // already exited
      }
    }, 2000);
  };
  const finishWs = (): void => {
    if (wsClosed) return;
    wsClosed = true;
    try {
      ws.close();
    } catch {
      // already closed
    }
  };

  // Worker stdout: one JSON object per line → WS (output as binary frames).
  let buffer = "";
  const pumpStdout = async (): Promise<void> => {
    const decoder = new TextDecoder();
    const reader = worker.stdout.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim() === "") continue;
        try {
          const message = JSON.parse(line) as { t: string; b64?: string };
          if (message.t === "output" && typeof message.b64 === "string") {
            if (!wsClosed) ws.send(Buffer.from(message.b64, "base64"));
          } else if (message.t === "exit" || message.t === "error") {
            if (!wsClosed) ws.send(JSON.stringify(message));
          }
        } catch {
          // ignore malformed worker lines
        }
      }
    }
    finishWs();
  };
  // Tell the worker which backend to host; the client's first resize
  // corrects the initial geometry.
  worker.stdin.write(
    `${JSON.stringify({ t: "spawn", backend: backendId, cols: 80, rows: 24 })}
`,
  );

  void pumpStdout();
  void worker.exited.then(finishWs);

  return {
    handleMessage(data) {
      if (workerClosed) return;
      try {
        if (typeof data === "string") {
          const message = JSON.parse(data) as { t: string; cols?: number; rows?: number };
          if (message.t === "resize") {
            worker.stdin.write(
              `${JSON.stringify({ t: "resize", cols: message.cols, rows: message.rows })}\n`,
            );
          }
          return;
        }
        // Binary frame: PTY input bytes.
        const b64 = Buffer.from(new Uint8Array(data)).toString("base64");
        worker.stdin.write(`${JSON.stringify({ t: "input", b64 })}\n`);
      } catch {
        // worker stdin already closed
      }
    },
    handleClose() {
      wsClosed = true;
      finishWorker();
    },
  };
}

const server = Bun.serve({
  port: PORT,
  fetch(request, server): Response | undefined {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const backend = url.searchParams.get("backend") ?? "";
      if (server.upgrade(request, { data: { backend } })) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return serveStatic(request) ?? new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      sessions.set(ws, createSession(ws, (ws.data as { backend: string }).backend));
    },
    message(ws, message) {
      sessions.get(ws)?.handleMessage(message as string | ArrayBuffer);
    },
    close(ws) {
      sessions.get(ws)?.handleClose();
      sessions.delete(ws);
    },
  },
});

if (!existsSync(DIST)) {
  console.error(
    `[example] frontend build missing at packages/example/dist — run "pnpm --filter @unipty/example build" first (pnpm example does this automatically)`,
  );
}

console.log(`[example] UniPty example → http://localhost:${server.port}`);
console.log(
  `[example] backend routing: node-pty→node, bun→bun, deno-sigma__pty-ffi→deno (worker: workers/pty-worker.mjs)`,
);
