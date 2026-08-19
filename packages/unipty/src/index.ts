/**
> Orthogonal intents (2026-08-20): public entry of the runtime-neutral PTY
> Core.
>
> Original request (2026-08-17): unify Deno, Node, and Bun PTY interfaces
> through replaceable Backends. This module exports the complete v1 public
 * contract: the configured `UniPty` Core, the public `Pty` surface, the
 * ready Backend / Endpoint seam, native data-plane representations, common
 * errors, capability tokens, and the Core protocol identity.
 */

export { UNIPTY_CORE_PROTOCOL_MAJOR } from "./protocol.ts";
export { UniPtyError, throwInvalidArgument } from "./errors.ts";
export type { UniPtyErrorCode } from "./errors.ts";
export { defineCapabilityToken } from "./capability.ts";
export type { CapabilityToken } from "./capability.ts";
export type {
  BackendExitResult,
  NativeChunk,
  NativeInput,
  NativeRepresentation,
} from "./native.ts";
export type { BackendEndpoint, ReadyPtyBackend, StructuredLaunch } from "./backend.ts";
export type {
  ProcessExitResult,
  Pty,
  PtyStreamEncoding,
  TerminalStreamChunk,
  UniPtyOptions,
  UniPtySpawnOptions,
} from "./pty.ts";
export { UniPty } from "./unipty.ts";
