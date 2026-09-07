## MODIFIED Requirements

### Requirement: Official zigpty Backend route

The official set SHALL include `@unipty/backend-zigpty` (route identity
`zigpty`, runtime target `node`) alongside the first-phase routes. The
package SHALL expose the asynchronous `createZigptyBackend(options)` factory
and the official Metadata Protocol, SHALL declare third-party `zigpty`
provenance, and SHALL pin an exact substrate version.

#### Scenario: Native gate rejects the pipe fallback

- **WHEN** the zigpty substrate reports no native addon for the host tuple
- **THEN** `createZigptyBackend()` readiness fails with `unsupported` and no
  pipe-based pseudo-PTY is ever spawned

#### Scenario: Transport close never terminates the child

- **WHEN** an Endpoint `close()` is invoked while the child is alive
- **THEN** the adapter defers the substrate transport teardown until the
  exit observation settles, so close does not cascade into termination

#### Scenario: Text-only input with explicit byte convenience

- **WHEN** a caller writes bytes to a strict zigpty Endpoint
- **THEN** the write fails with `unsupported`, and only a Backend-owned
  `writeDecode` option accepts byte input by decoding it

#### Scenario: A saturated byte value never advances decoder state

- **WHEN** a byte value is rejected by the bounded admission queue while a
  split multibyte sequence is pending in the writeDecode decoder
- **THEN** retrying the same bytes after drain decodes them exactly as first
  attempted — rejection is whole-value, including decoder state

#### Scenario: Windows fails closed without usable flow control

Superseded 2026-09-07 by this change (adapter-mediated soft support); the
scenario keeps its historical name for OpenSpec traceability — a MODIFIED
block may not drop scenarios the current spec still has.

- **WHEN** the substrate's public output flow control is inert on a platform
  (pause/resume are no-ops on Windows in 0.2.1)
- **THEN** the factory no longer refuses readiness there; the Endpoint keeps
  draining native output, documentation declares that output backpressure
  does not reach the kernel on that platform (the Deno-route limitation
  class), and metadata target declarations leave `os` open while evidence
  gating keeps Windows tuples declared-unverified until conformance records
  exist

#### Scenario: Disk spool bounds output memory by adapter option

- **WHEN** a Backend is created with `outputSpool` enabled and a consumer
  stops pulling while the child keeps producing output
- **THEN** undelivered records accumulate in a FIFO spool whose in-memory
  head stays within the configured `memoryBytes` bound (records beyond it
  spill to one adapter-owned temp file), the pump replays records into the
  private source only while the consumer pulls, text records round-trip per
  complete record so the aggregate stream is unchanged, and the spill file
  is deleted when the source completes, the Endpoint closes, or the source
  is cancelled

#### Scenario: Spooled output completes only after the tail drains

- **WHEN** a transport-EOF trigger fires while the spool still holds
  undelivered records
- **THEN** source completion is deferred behind continued consumer-paced
  replay, so the fast-exit tail is fully delivered before the source closes;
  explicit `close()` still completes the source synchronously and drops
  undelivered spool content
