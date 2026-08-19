# pty-conformance-evidence Specification

## Purpose
Establish a public, repeatable acceptance seam for every Backend and convert only
complete native passes into exact, release-attached compatibility evidence.

## Requirements

### Requirement: Public-package conformance seam

The system SHALL provide one conformance suite that imports Core and Backend
packages through their installed public exports and observes public `Pty`
behaviour through a ready UniPty instance. Adapter-internal tests and mocks MAY
support local diagnostics but SHALL NOT establish native PTY support.

#### Scenario: Native support requires a real child program

- **WHEN** an official Backend is evaluated for a support tuple
- **THEN** the suite runs a deterministic child program in a real PTY and does
  not accept a mock transport or successful module import as proof

### Requirement: Contract coverage profile

The public conformance suite SHALL cover structured launch, geometry fallback,
native text and bytes, incremental decoding, stream detachment, bootstrap
buffering, one active stream, write readiness, drain, bounded saturation,
resize, normal and signalled exit, non-cascading close and terminate, disposal,
common error codes, and capability-token identity. It SHALL test selected
AutoResolve and manifest behaviour without loading unselected candidates.

#### Scenario: Transport EOF and process exit are separately observed

- **WHEN** a child exits non-zero or the PTY transport ends independently
- **THEN** the suite observes each public result without treating one as proof of
  the other

### Requirement: Positive verification evidence

A native matrix job SHALL emit one Verification Evidence record only after the
complete public conformance suite passes. The record SHALL identify exact
Backend/Core package versions, Backend identity, runtime version, normalized
OS/arch/libc tuple, suite identity and version, tested commit, and verification
time. Failed, cancelled, skipped, partial, or missing jobs SHALL emit no
permanent unsupported record.

#### Scenario: Failed job cannot produce an unsupported claim

- **WHEN** a native matrix job fails before completing the suite
- **THEN** no Verification Evidence is emitted and documentation does not derive
  a permanent unsupported state from that failure

### Requirement: Deterministic release catalog

A release aggregation step SHALL validate evidence schema, package/metadata
identity, tuple normalization, tested commit, uniqueness, and required route
coverage. It SHALL emit one stable-order catalog artifact that snapshots the
released official metadata and positive evidence; Core and Backend selection
SHALL not fetch or consume that artifact.

#### Scenario: Contradictory evidence is rejected during aggregation

- **WHEN** aggregation receives duplicate or contradictory records for the same
  release evidence identity
- **THEN** the release catalog is rejected instead of choosing a record by input
  order

### Requirement: First-phase release gates

Package publication SHALL require at least one native passing tuple for each of
the Node, Bun, and Deno official routes. Deno release acceptance SHALL install
the packed npm artifact in an isolated consumer, reject published runtime
`jsr:` specifiers, verify the selected packaged library exists, and run the same
public suite with required FFI permission. Site deployment SHALL remain
independently retryable after the release artifact is attached.

#### Scenario: Deno workspace success cannot bypass packed-artifact acceptance

- **WHEN** Deno route validation passes only against workspace source or direct
  JSR execution
- **THEN** package publication remains blocked until the packed npm consumer
  passes the Deno public conformance gate
