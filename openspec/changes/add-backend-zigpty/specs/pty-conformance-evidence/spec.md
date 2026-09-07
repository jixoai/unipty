## MODIFIED Requirements

### Requirement: First-phase release gates

Package publication SHALL require at least one native passing tuple for
each official route — `node-pty`, `bun`, `deno-sigma__pty-ffi`, and
`zigpty`. The route registry SHALL be keyed by route identity (the
substrate), not by runtime, so multiple routes may share one runtime. Deno
release acceptance SHALL install the packed npm artifact in an isolated
consumer, reject published runtime `jsr:` specifiers, verify the selected
packaged library exists, and run the same public suite with required FFI
permission. Site deployment SHALL remain independently retryable after the
release artifact is attached.

#### Scenario: A second node-runtime route is independently gated

- **WHEN** a release aggregates evidence and one of two node-runtime routes
  (for example `node-pty` and `zigpty`) lacks a passing native tuple
- **THEN** package publication stays blocked for that release even though
  the other node route passed

#### Scenario: Deno workspace success cannot bypass packed-artifact acceptance

- **WHEN** Deno route validation passes only against workspace source or direct
  JSR execution
- **THEN** package publication remains blocked until the packed npm consumer
  passes the Deno public conformance gate
