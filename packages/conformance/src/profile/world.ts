/**
> Orthogonal intents (2026-08-20): per-scenario world — lazy ready Backend +
> UniPty construction, fixture spawning, stream reading, and guaranteed
> teardown (task 4.1).
>
 * The profile drives ONLY public surfaces: `UniPty.spawn` returns a public
 * `Pty`, and every observation goes through `Pty` operations. Endpoint
 * internals are never touched.
 */

import type { Pty, ReadyPtyBackend, UniPtySpawnOptions } from "unipty";
import { UniPty } from "unipty";
import { childArgv, type CurrentRuntimeInfo, type FixtureName } from "../fixtures/fixtures.ts";
import {
  quiescePty,
  readReaderToCompletion,
  readReaderUntil,
  withTimeout,
  normalizeTtyText,
} from "./util.ts";

/** Backend-declared accommodations, recorded explicitly on scenario results. */
export interface ScenarioAccommodations {
  /**
   * The transport cannot propagate geometry to the child's own tty view
   * (pipe-based test doubles); resize observation is skipped with a record.
   */
  readonly resizeUnobservable?: boolean;
  /**
   * The substrate's termination primitive destroys the exit-observation
   * channel together with the child (kill-without-close does not exist), so
   * an exit not yet observed at terminate() settles as null/null instead of
   * a non-zero code or signal. Declared by @unipty/backend-deno-sigma__pty-ffi.
   */
  readonly exitUnobservableAfterTerminate?: boolean;
}

/** Profile-level context every scenario receives. */
export interface ProfileContext {
  readonly runtime: CurrentRuntimeInfo;
  readonly backendIdentity: { readonly packageName: string; readonly backendId: string };
  readonly accommodations: ScenarioAccommodations;
}

/**
 * One scenario's isolated world: fresh Backend + Core instance, tracked
 * PTYs, and stream helpers. `ready()` is async (Backend factories are async);
 * after it, `spawn` stays synchronous, which `seam/synchronous-spawn`
 * verifies.
 */
export class ScenarioWorld {
  private readonly createBackend: () => Promise<ReadyPtyBackend>;
  readonly ctx: ProfileContext;
  private readonly instances: UniPty[] = [];
  private readonly ptys: Pty[] = [];
  private primary: UniPty | null = null;

  constructor(createBackend: () => Promise<ReadyPtyBackend>, ctx: ProfileContext) {
    this.createBackend = createBackend;
    this.ctx = ctx;
  }

  /** Create (once) the ready Backend and the configured Core instance. */
  async ready(): Promise<UniPty> {
    if (this.primary !== null) return this.primary;
    const backend = await this.createBackend();
    const unipty = new UniPty({ backend });
    this.instances.push(unipty);
    this.primary = unipty;
    return unipty;
  }

  /** Register an externally constructed Core instance (disposal scenario). */
  useUnipty(unipty: UniPty): void {
    this.instances.push(unipty);
    this.primary = unipty;
  }

  /** Raw factory access for scenarios that wrap the Backend themselves. */
  createBackendRaw(): Promise<ReadyPtyBackend> {
    return this.createBackend();
  }

  /** Synchronous public spawn on the current Core instance. */
  spawn(argv: readonly string[], options?: UniPtySpawnOptions): Pty {
    if (this.primary === null) {
      throw new Error("scenario bug: await world.ready() before world.spawn()");
    }
    const pty = this.primary.spawn(argv, options);
    this.ptys.push(pty);
    return pty;
  }

  /** Spawn one deterministic child fixture under the current runtime. */
  spawnFixture(
    fixture: FixtureName,
    args: readonly string[] = [],
    options?: UniPtySpawnOptions,
  ): Pty {
    return this.spawn(childArgv(fixture, args), options);
  }

  /** Read the full Terminal Text view of a PTY to normal completion (ONLCR-normalized). */
  async collectText(pty: Pty, timeoutMs: number): Promise<string> {
    const reader = pty.stream({ encoding: "utf8" }).getReader();
    const chunks = await withTimeout(readReaderToCompletion(reader), timeoutMs, "collectText");
    return normalizeTtyText(chunks.join(""));
  }

  /** Read until the text satisfies the predicate; the view stays active. */
  async readUntil(
    reader: ReadableStreamDefaultReader<string>,
    satisfies: (text: string) => boolean,
    label: string,
    timeoutMs: number,
  ): Promise<string> {
    return readReaderUntil(reader, satisfies, label, timeoutMs);
  }

  /** Detach a view by cancelling its reader. */
  async detach(reader: ReadableStreamDefaultReader<string>): Promise<void> {
    await reader.cancel();
  }

  /**
   * Await the echo fixture's one-time READY handshake on an active view
   * before writing: bulk input written before the child applied raw mode
   * would land in the boot-time canonical buffer and be dropped.
   */
  async awaitEchoReady(
    reader: ReadableStreamDefaultReader<string>,
    timeoutMs = 15000,
  ): Promise<void> {
    await readReaderUntil(
      reader,
      (text) => text.includes("ECHO-READY"),
      "echo fixture READY handshake",
      timeoutMs,
    );
  }

  /** Terminate/close every tracked PTY, then dispose every Core instance. */
  async cleanup(): Promise<void> {
    for (const pty of this.ptys) {
      await quiescePty(pty);
    }
    this.ptys.length = 0;
    for (const unipty of this.instances) {
      try {
        await withTimeout(unipty.dispose(), 15000, "scenario cleanup disposal");
      } catch {
        // cleanup must never mask the scenario outcome; failures here are
        // surfaced by the disposal-focused scenarios themselves
      }
    }
    this.instances.length = 0;
    this.primary = null;
  }
}
