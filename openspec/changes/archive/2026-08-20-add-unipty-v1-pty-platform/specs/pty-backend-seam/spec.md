## Purpose

Define the Backend author interface that absorbs native PTY variation while
leaving public stream, lifecycle, error, and state semantics owned by Core.

## ADDED Requirements

### Requirement: Ready Backend injection

The Core-facing Backend SHALL already be ready when it is supplied to `UniPty`.
It SHALL synchronously create one private Endpoint for each structured launch
and SHALL expose asynchronous shared-resource disposal. Backend acquisition,
including native loading, connection, authentication, or negotiation, SHALL
finish before Core construction and SHALL not make public spawn asynchronous.

#### Scenario: Ready Backend creates a synchronous PTY boundary

- **WHEN** a caller invokes `spawn()` on a configured UniPty instance
- **THEN** it receives the public PTY synchronously or a typed synchronous launch
  failure, without waiting for Backend acquisition

### Requirement: Core-owned public PTY semantics

An Endpoint SHALL supply native transport facts to Core and SHALL NOT construct,
return, or independently own the public `Pty`. Core SHALL exclusively own public
stream views, representation conversion, bootstrap buffering, common errors,
backpressure semantics, and public lifecycle state.

#### Scenario: Endpoint transport does not become a second public stream API

- **WHEN** an adapter supplies ordered native output to Core
- **THEN** consumers observe output only through the public Terminal Stream
  contract and cannot use adapter transport cancellation to alter Core semantics

### Requirement: Ordered native output and independent exit observation

An Endpoint SHALL provide one ordered source of explicitly tagged native bytes,
native text, or both, plus a repeatably awaitable exit observation containing an
exit code and observed signal cause. Transport EOF, public stream cancellation,
and logical close SHALL remain independent from that exit observation.

#### Scenario: Native text does not impersonate native bytes

- **WHEN** an adapter supplies only native text
- **THEN** Core can expose UTF-8 text but a bytes view fails explicitly rather
  than re-encoding text and claiming native byte fidelity

### Requirement: Endpoint input, geometry, and lifecycle controls

An Endpoint SHALL synchronously accept explicitly native text or native bytes,
return Write Readiness, provide `drain()`, apply valid character-cell resize, and
support idempotent non-cascading close and termination requests. A text-native
Backend that accepts byte writes SHALL do so only through its explicit
Backend-owned write decoder; its queue policy and physical teardown order SHALL
remain Backend-owned.

#### Scenario: Text-native byte convenience remains explicit

- **WHEN** a text-native Backend has not enabled a write decoder and receives a
  public byte write
- **THEN** the operation fails explicitly rather than silently decoding bytes in
  the common upper layer

### Requirement: Typed Backend extension access

The public PTY SHALL support opaque capability-token lookup for Backend-specific
operations. A Backend package SHALL own stable singleton tokens and branded
capability values; lookup SHALL use token object identity, SHALL return
`undefined` for tokens from duplicate package instances, and SHALL not fall back
to a string capability name.

#### Scenario: Duplicate Backend packages do not share a capability token

- **WHEN** a caller uses an equal-looking token loaded from another copy of a
  Backend package
- **THEN** capability lookup returns `undefined` without attempting a name-based
  compatibility match

### Requirement: Backend wrapper extensibility

A Backend wrapper SHALL be able to adapt another Backend or terminal host while
satisfying the same ready Backend contract. Persistence, reconnection, remote
transport, signal vocabulary, and physical cleanup policy SHALL remain explicit
wrapper or Backend behaviour and SHALL not expand the common v1 PTY guarantee.

#### Scenario: Remote wrapper reports unsupported common operations

- **WHEN** a wrapper cannot perform a common operation such as resize
- **THEN** it reports `unsupported` through the common error contract rather
  than silently substituting another terminal behaviour
