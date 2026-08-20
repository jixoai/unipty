# @unipty/example

Local example app: a shadcn/ui tabbed terminal where every tab is a **real
PTY** hosted by the backend you pick — and each backend runs under its own
runtime (node / bun / deno). One WebSocket per tab; xterm.js in the browser.

English | [简体中文](../../README-zh.md#包一览) · [Workspace root](../../README.md)

## Run

```sh
pnpm example        # from the workspace root: builds the frontend, then Bun.serve
```

Open <http://localhost:5176>, click **New**, pick a backend, and you get an
interactive shell. `node`, `bun`, and `deno` must be on `PATH` for their
respective routes (missing runtimes produce an explicit error message in the
terminal pane).

## Architecture

```text
browser (React + shadcn/ui + xterm.js)
   │  tabs: [Node] [Bun] [Deno] …          one WebSocket per tab
   ▼
Bun.serve (server.ts)
   │  /ws?backend=<id>  ── route by backend:
   │    node-pty           → spawn "node workers/pty-worker.mjs"
   │    bun                → spawn "bun  workers/pty-worker.mjs"
   │    deno-sigma__pty-ffi→ spawn "deno run -A --no-check workers/pty-worker.mjs"
   ▼
workers/pty-worker.mjs  (same runtime-neutral source, hosted by the chosen runtime)
   │  line-delimited JSON over stdio
   ▼
UniPty Core → official Backend → real PTY → your shell
```

The whole demo rests on UniPty's runtime neutrality: **one worker source**
drives all three official routes because the public contract (`spawn`,
`stream`, `write`, `resize`, `terminate`, `close`, `exited`) is identical —
only the hosting runtime differs per backend.

### Wire protocols

- Browser ⇄ server (`/ws`): binary frames are PTY bytes both ways; text
  frames are JSON control (`{"t":"resize","cols":C,"rows":R}` client→server;
  `{"t":"exit"|"error",…}` server→client).
- Server ⇄ worker (stdio, NDJSON):
  `{t:"spawn"|​"input"|"resize"|"terminate"|"close"}` in,
  `{t:"output"|​"exit"|"error"}` out (payload base64).

The worker reports `TERM=xterm-256color` to the child because the browser
terminal genuinely is one; exit observations arrive independently of output
EOF and are rendered as a closing status line.

## Layout

| Path                                   | Role                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `server.ts`                            | `Bun.serve`: static `dist/`, WebSocket sessions, per-backend runtime routing |
| `workers/pty-worker.mjs`               | Runtime-neutral UniPty worker (node/bun/deno host the same file)             |
| `src/App.tsx`                          | The Tabs shell: dynamic tab list, per-tab close, empty state                 |
| `src/components/NewTerminalDialog.tsx` | shadcn Dialog + Select for backend choice                                    |
| `src/components/TerminalPane.tsx`      | xterm.js + FitAddon + WebSocket wiring                                       |
| `src/components/ui/*`                  | shadcn-style primitives (button / tabs / select / dialog)                    |

## Scripts

```sh
pnpm --filter @unipty/example dev     # vite dev server (frontend only, no backend)
pnpm --filter @unipty/example build   # vite build → dist/
pnpm --filter @unipty/example start   # bun server.ts (serves dist/ + /ws)
```
