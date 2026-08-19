## Purpose

Provide one observable PTY contract that application code can use across Node,
Bun, and Deno without accepting hidden shell execution or runtime substitution.

## ADDED Requirements

### Requirement: Configured Core and structured launch

The system SHALL construct a configured `UniPty` from one ready Backend and
SHALL expose synchronous `spawn(argv, options)` for each PTY. `argv` SHALL be a
non-empty executable-plus-arguments vector; the system SHALL reject an empty
vector with `invalid-argument` and SHALL provide no string-command overload or
implicit shell evaluation.

#### Scenario: Metacharacters remain launch data

- **WHEN** a caller supplies shell metacharacters as values in a non-empty argv
- **THEN** the system passes them as structured launch data and does not select
  or invoke a shell

### Requirement: Terminal geometry resolution

The system SHALL accept initial geometry only in `spawn` options under
`terminal: { cols, rows }` and SHALL require positive integer character-cell
dimensions. For each omitted dimension, it SHALL resolve explicit value, then a
valid Core-host `COLUMNS` or `LINES` value, then a trustworthy host TTY value,
then the corresponding `80 x 24` default; the child launch environment SHALL
not silently alter this resolution.

#### Scenario: Partial geometry fallback

- **WHEN** only one terminal dimension is explicitly supplied and the other host
  environment value is invalid or absent
- **THEN** the explicit dimension is retained and the other dimension continues
  independently through the fallback sequence

### Requirement: Representation-selecting terminal stream

The system SHALL provide `pty.stream({ encoding: "utf8" | "bytes" })` as an
ordered Terminal Stream. The UTF-8 view SHALL yield strings, preferring native
text and otherwise incrementally decoding native bytes; the bytes view SHALL
yield only native byte chunks and SHALL never label re-encoded text as native
bytes. A PTY SHALL permit one active Terminal Stream; a concurrent second view
SHALL fail with `active-stream`.

#### Scenario: Stream cancellation detaches only the view

- **WHEN** a caller cancels an established Terminal Stream or exits its async
  iteration early while the PTY is still running
- **THEN** the view detaches without closing input, transport, or the child, and
  a later stream receives only output produced after its subscription

### Requirement: Bootstrap output and stream completion

The system SHALL retain bounded startup output until the first Terminal Stream
is established and SHALL preserve its ordering. After all established views
detach, it SHALL continue consuming or discarding output without promising
scrollback or replay. Explicit `close()` SHALL complete an active Terminal Stream
normally; a transport read failure SHALL error that stream independently.

#### Scenario: Startup output precedes the first subscription

- **WHEN** a child emits a startup marker before the caller creates the first
  Terminal Stream
- **THEN** that stream receives the marker in output order unless bounded
  bootstrap capacity explicitly rejects further production

### Requirement: Write readiness and advisory backpressure

The system SHALL accept public input as `string | Uint8Array` and SHALL return
only boolean Write Readiness from `write()`. Either boolean SHALL mean that the
complete value was accepted exactly once; `false` SHALL advise the caller to
await `drain()` and SHALL never request a retry. Saturation SHALL reject one
whole value with `backpressure`, without partial acceptance, silent loss, or an
unbounded common queue. `drain()` SHALL represent readiness recovery rather than
physical flush or child consumption.

#### Scenario: Saturated write is not partially accepted

- **WHEN** a Backend cannot admit the next complete input value
- **THEN** `write()` reports `backpressure` synchronously and none of that value
  enters the PTY input sequence

### Requirement: Resize, exit, and non-cascading lifecycle

The system SHALL expose `resize(cols, rows)`, `close()`, `terminate()`, and an
independent Process Exit Result observation. Resize SHALL reject non-positive,
fractional, non-finite, and pixel inputs with `invalid-argument`; unsupported
Backend resize SHALL be explicit. `close()` and `terminate()` SHALL be
idempotent synchronous requests and SHALL not implicitly invoke one another.
After close, write, resize, and new stream creation SHALL reject with `closed`,
while an already-established exit observation remains settleable.

#### Scenario: Closing a live PTY does not synthesize process completion

- **WHEN** a caller closes a PTY whose child is still running
- **THEN** all PTY I/O surfaces become closed while the independent exit result
  remains observable and no termination result is fabricated

### Requirement: Graceful UniPty disposal

The system SHALL expose `UniPty.dispose(): Promise<void>` as the configured
Backend resource boundary. Its first invocation SHALL immediately prevent new
spawns; repeated invocations SHALL return the same Promise. It SHALL leave
existing PTYs caller-owned, wait for all of them to close, and then release
shared Backend resources exactly once.

#### Scenario: Disposal waits without terminating existing PTYs

- **WHEN** disposal begins while one or more PTYs remain open
- **THEN** those PTYs remain usable until their callers close them and the
  disposal Promise waits before shared Backend release
