Type: research
Status: resolved

Part of: [UniPty v1 Wayfinder Map](../map.md)

## Question

从 Termless 的官方仓库、文档和可运行代码中，确认其 PTY、进程、transport、session、Backend 或类似扩展边界、关键生命周期语义，以及哪些架构判断可以迁移到 UniPty。不得用搜索摘要或二手描述替代一手证据。

## Answer

### Evidence basis

- **Fact (current upstream snapshot):** this answer is based on the official
  [`beorn/termless`](https://github.com/beorn/termless) repository at
  [`92a6e6b`](https://github.com/beorn/termless/tree/92a6e6b449912f7c020263360f8e6c9580c3fd16),
  fetched on 2026-08-18. Its package describes Termless as a headless terminal
  _testing_ library, not a process/session runtime.

### What Termless separates

```
PTY child output ----> TerminalBackend ----> terminal buffer / assertions
       ^                      |
       |                      +---- emulator protocol responses ----> PTY child
       |
 structured argv + input + resize

session runtime (persist / resume / multiplex)  [outside Termless]
```

- **Fact:** a Termless `Backend` is specifically a VT-emulator: it consumes
  bytes and owns screen state (cells, cursor, scrollback, modes). The official
  architecture says the backend neither owns a PTY nor spawns processes; the
  `Terminal` wrapper adds those concerns.
  [Concept](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/docs/concepts/backend.md)
  and [contract](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/src/terminal/types.ts#L266-L305).
- **Fact:** its optional PTY layer adapts Bun's native terminal spawn or
  Node's optional `node-pty` peer into a small portable process handle:
  `write`, `resize`, `closePty`, `kill`, `pid`, `exitCode`, and `exited`.
  It bridges Node's string output to `Uint8Array`; this is an adapter choice,
  not a public cross-runtime byte guarantee.
  [Source](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/src/terminal/spawn.ts#L11-L193).
- **Fact:** launching is direct `argv` (`[program, ...args]`), without an
  implicit shell. Termless has a separate explicit `shellCommand` form that
  runs `bash -c`; its own PTY test verifies literal shell metacharacters are
  not evaluated for direct argv.
  [Source](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/src/terminal/pty.ts#L26-L85)
  and [test](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/tests/pty.pty.test.ts#L114-L139).
- **Fact:** after spawn, Termless feeds PTY output to the emulator and wires
  emulator-generated protocol responses back to the active PTY. `resize`
  updates the emulator first and then the live PTY. This is a bidirectional
  terminal transport loop, not merely stdout capture.
  [Source](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/src/terminal/terminal.ts#L203-L254)
  and [resize source](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/src/terminal/terminal.ts#L533-L560).
- **Fact:** its lifecycle observation is minimal: `alive` and a nullable,
  formatted `exitInfo`. `close()` is idempotent, closes the PTY channel, sends
  TERM, waits up to two seconds, then sends KILL. Cleanup errors are swallowed.
  The process test suite covers output, liveness, eventual exit information,
  direct input, argv preservation, and resize, but does not establish a richer
  signal/exit-reason contract.
  [Source](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/src/terminal/pty.ts#L87-L142)
  and [tests](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/tests/pty.pty.test.ts#L39-L151).
- **Fact:** extensions and capability discovery belong to the emulator
  backends: the contract exposes terminal-emulation capabilities and optional
  interfaces (mouse encoding, palette, dirty rows, hyperlinks, bell). Its
  named backend registry resolves JS/WASM/native/OS _emulator_ packages. This
  is not an extension mechanism for process hosts or durable sessions.
  [API](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/docs/api/backend.md#L50-L68)
  and [registry](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/src/backend/backends.ts#L25-L164).
- **Fact:** the upstream runtime-boundary document explicitly assigns
  persistence, resumption, and multiplexing to a session runtime outside
  Termless. It says a runtime should apply PTY output and resize events in one
  ordered stream, use an engine's snapshot/restore state, and avoid treating a
  text projection as state.
  [Official boundary](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/docs/advanced/terminal-runtime-boundary.md#L1-L50).
- **Fact:** its CLI/MCP session layer is process-local tooling: `SessionManager`
  keeps `Backend + PTY` sessions in an in-memory `Map`, gives them incrementing
  IDs, and `stopSession` closes then removes the entry. The MCP transport is
  local stdio. This is neither durable storage nor a reconnect protocol.
  [Manager](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/packages/cli/src/session.ts#L108-L220),
  [transport](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/packages/cli/src/mcp.ts#L1-L34),
  and [session API docs](https://github.com/beorn/termless/blob/92a6e6b449912f7c020263360f8e6c9580c3fd16/docs/reference/mcp.md#L32-L75).

### Transferable decisions for UniPty

- **Inference, adopt:** preserve a direct structured launch request as the
  default. Shell interpretation must be an explicit, separately selected
  concern. This reinforces the existing `Structured Launch Request` and
  `Shell Script Request` boundary.
- **Inference, adopt:** model the core data plane as bidirectional terminal
  traffic: backend output reaches the consumer, while terminal protocol
  responses and user input can return to the selected Backend. Do not reduce
  the contract to stdout/stderr pipes.
- **Inference, adopt:** keep persistent, reconnectable, and multiplexed
  sessions out of the UniPty v1 core. A wrapper Backend may supply them, but
  needs an explicitly declared extension rather than an assumed shared
  lifecycle.
- **Inference, do not copy:** do not reuse `TerminalBackend` as `PtyBackend`.
  Termless's interface is intentionally a large emulator-state contract; UniPty
  needs a smaller process/PTY contract that can be implemented by native PTY
  adapters and terminal-host wrappers alike.
- **Inference, improve:** retain explicit lifecycle states and structured exit
  results rather than Termless's string `exitInfo`; its TERM-to-KILL grace
  policy is a reasonable Backend-local teardown strategy, not a universal v1
  semantic.
- **Inference, test seam:** Termless's real-process PTY tests support UniPty's
  proposed single public conformance seam: run structured launch, I/O, resize,
  natural exit, requested termination, and unsupported behaviour against a
  deterministic child program, not adapter internals.

### Limits

- **Fact:** the inspected Termless source only implements a Node/Bun PTY
  adapter; it provides no Deno PTY implementation. It therefore cannot settle
  UniPty's Deno or Windows contract.
- **Fact:** its backend capability vocabulary describes terminal emulators,
  not PTY hosts. UniPty capability names must be derived from the separate
  runtime/OS matrix, not copied from Termless.
