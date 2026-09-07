## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Substrate provenance remains explicit

The Node Backends SHALL adapt third-party `node-pty` and third-party
`zigpty` respectively; the Bun Backend SHALL adapt runtime-native
`Bun.Terminal`; and the Deno Backend SHALL adapt third-party `@sigma/pty-ffi`
over Rust `portable-pty`. Package names, metadata provenance, and
documentation SHALL preserve those distinctions and SHALL not represent a
substrate as a different runtime's native API.

#### Scenario: Node route is not described as a Node runtime API

- **WHEN** documentation or metadata identifies a Node official route
- **THEN** it names its substrate (`node-pty` or `zigpty`) rather than
  claiming a native Node PTY API
