# @unipty/backend-node-pty

[English](./README.md) | [简体中文](./README-zh.md) · [GitHub](https://github.com/jixoai/unipty) · [Docs](https://unipty.jixoai.com)

Official UniPty Backend for Node runtimes, adapting the third-party
**node-pty** substrate — never a native Node runtime PTY API.

- **Route identity:** `node-pty`
- **Provenance:** third-party `node-pty`, acquired through the
  [`@lydell/node-pty`](https://www.npmjs.com/package/@lydell/node-pty)
  prebuilt distribution
- **Core protocol:** `1`

## Why `@lydell/node-pty`?

The upstream `node-pty@1.1.0` npm prebuilds fail `posix_spawnp` on
darwin-arm64 under Node 22 (the child never starts). `@lydell/node-pty` ships
per-platform prebuilt binaries via `optionalDependencies`
(`@lydell/node-pty-<os>-<arch>`), installs only the current platform's binary,
never invokes node-gyp, and re-exports the same `node-pty` API. It is a
distribution of node-pty, not a different PTY implementation.

## Usage

```ts
import { UniPty } from "unipty";
import { createNodePtyBackend } from "@unipty/backend-node-pty";

// One-time substrate load (pulls the platform prebuilt addon); everything
// after this point is synchronous.
const backend = await createNodePtyBackend();

const unipty = new UniPty({ backend });
const pty = unipty.spawn(["/bin/sh", "-i"], {
  cwd: process.env.HOME,
  terminal: { cols: 120, rows: 40 },
});

const text = pty.stream({ encoding: "utf8" });
for await (const chunk of text) console.log(chunk);

pty.write("echo hi\n");
pty.terminate();
pty.close();
```

Acquisition is explicit: `await import()` + `createNodePtyBackend()` remains
the deterministic path; `@unipty/backend`'s `autoResolveUniPtyBackend()` is the
convenience wrapper. Metadata is exported side-effect-free from
`@unipty/backend-node-pty/unipty.metadata` (schema 1; importing it loads no
native addon and creates no pty).

## Options

```ts
createNodePtyBackend({
  encoding?: "buffer" | "utf8", // default "buffer"
  writeDecode?: true | TextDecoder,
  name?: string, // passed to the substrate; becomes $TERM in the child
})
```

| Mode                               | Endpoint `native`                    | Output chunks                                                        | Input acceptance                                                      |
| ---------------------------------- | ------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `encoding: "buffer"` (default)     | `{ input: "both", output: "bytes" }` | `{ kind: "bytes", bytes }` (`Buffer` passes through as `Uint8Array`) | text and bytes; the substrate encodes strings to UTF-8 itself         |
| `encoding: "utf8"`                 | `{ input: "text", output: "text" }`  | `{ kind: "text", text }`                                             | text only; byte writes fail with `unsupported`                        |
| `encoding: "utf8"` + `writeDecode` | `{ input: "both", output: "text" }`  | `{ kind: "text", text }`                                             | text and bytes; bytes flow through one stateful adapter-owned decoder |

`writeDecode: true` installs a non-fatal UTF-8 `TextDecoder`; passing your own
`TextDecoder` copies its encoding/fatal/BOM configuration into a **per-PTY**
stateful decoder — decoder state is never shared across PTYs. A fatal decode
failure rejects the whole value with `invalid-argument` and the original
`TypeError` as `cause`. `writeDecode` with `encoding: "buffer"` is rejected —
byte-native input already accepts bytes.

Write readiness: each Endpoint owns a bounded admission queue (default 1 MiB,
soft resume mark at three quarters; tune with `writeQueueBytes`). Values are
handed to the substrate whole, so `write()` returns `false` past the soft mark
(pause advice; `drain()` resolves below it) and rejects a whole value with
`backpressure` at the hard bound — never partial acceptance. `drain()` is
readiness recovery, not a physical flush: the substrate's own fd write queue
has no completion signal.

## Substrate behavior this adapter maps (and documents)

Verified against the installed `@lydell/node-pty` 1.2.0-beta.15 sources:

- **`close()` = logical transport release, no signal, deferred physical
  teardown.** The substrate's public `destroy()` explicitly sends `SIGHUP`
  after closing the socket (unix) or calls `kill()` (Windows), so it would
  cascade close into termination. And on Linux the kernel itself SIGHUPs the
  session leader as soon as the last master fd closes — so this adapter
  releases the master socket and the substrate's write stream only after the
  child has exited (or the transport errored): the closed state, stream
  completion, and I/O rejection are immediate, while the child is never
  signaled by the close and the exit observation stays pending until true
  child death.
- **`terminate()` = `kill()` with the substrate default signal** (`SIGHUP` on
  unix; agent shutdown on Windows). The substrate swallows `ESRCH`, keeping it
  idempotent. Transport stays open.
- **`exited`** wraps `onExit` once. Unix reports `signal` as a number (`0` =
  no signal); nonzero numbers map to their observed string form (`"SIGTERM"`).
  The substrate emits exit only after socket close (with a 200 ms fallback
  timeout), so exit observations can lag child death by a fraction of a
  second.
- **Exec failures are exit observations, not spawn exceptions.** The substrate
  forks then execs; a missing executable produces an immediate
  `{ exitCode: 1, signal: null }` rather than a throw. Only argument-shaped
  failures surface as typed synchronous spawn errors (`invalid-argument` /
  `unsupported` with the original error as `cause`).
- **Geometry and resize** reach the child as real tty winsize updates.
- **Output backpressure propagates to the kernel.** The master socket is
  paused whenever the Core-owned source falls behind and resumed on pull, so
  a stalled consumer cannot grow an unbounded adapter queue.
- **Transport EOF and read errors are distinct.** A master-socket read
  failure errors the output source (`unsupported` with the original error as
  `cause`); only a clean close completes it normally.

## Deployment

- The prebuilt native addon ships inside `@lydell/node-pty`'s
  platform-specific `optionalDependencies` packages; installing this package
  with a normal package manager materializes the correct binary. Do not use
  `--omit=optional`, and do not copy `node_modules` between operating systems.
- Keep this package **external and resolver-visible** in host bundles (the
  same rule as any native-addon package): bundling or relocating the emitted
  modules detaches the substrate's package tree. For bundled deployments, use
  `@unipty/helper-backend` to generate an explicit Backend manifest with
  deferred loaders.
- Pure Node deployment story: no FFI, no runtime flags, no permissions, no
  post-install compilation on the supported prebuilt platforms.

## Support status

Metadata declares the runtime level only (`targets: [{ runtime: "node" }]`);
`os`/`arch` stay open, and a tuple counts as **verified** only with published
public-contract evidence for the exact package versions (see the release
catalog). Absent evidence, tuples are _declared-unverified_ — the declaration
prefilters selection, it never promises native loadability.

## License

MIT.
