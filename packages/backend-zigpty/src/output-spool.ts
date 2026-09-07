/**
> Orthogonal intents (2026-09-07): adapter-owned disk-backed output spool for
> the zigpty route — the substrate-facing answer to platforms where output
> backpressure cannot propagate into the kernel (Windows pause/resume are
> no-ops) and to consumers that stall for unbounded time.
>
> Owner directive (2026-09-07): 我们需要提供一些适配器来弥补各种需求；
> 担心软暂停输出导致内存狂涨，可以在适配器那边提供磁盘化的方案。
> The module is dependency-free and route-internal; promoting it to a shared
> helper for other Backend authors is a move, not a rewrite, once a second
> consumer exists.
*/

import { closeSync, openSync, readSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { UniPtyError } from "unipty";
import type { NativeChunk } from "unipty";

/** Default in-memory head before records spill (1 MiB). */
export const DEFAULT_SPOOL_MEMORY_BYTES = 1 << 20;

/** Concrete, validated spool configuration snapshot (per Backend). */
export interface OutputSpoolOptions {
  /** In-memory head bound in bytes; records beyond it spill to disk. */
  readonly memoryBytes: number;
  /** Directory holding the spill file (default: the OS temp directory). */
  readonly directory: string;
}

/** One spooled record on disk: `[kind: 1][payload length: uint32 LE][payload]`. */
const RECORD_TEXT = 0;
const RECORD_BYTES = 1;
const RECORD_HEADER_BYTES = 5;

let spillFileCounter = 0;

/** Typed spool failure; transport-class from the private source's viewpoint. */
function spoolFailure(stage: "append" | "replay", cause: unknown): UniPtyError {
  return new UniPtyError("unsupported", `the output spool failed a disk ${stage} operation`, {
    details: { substrate: "zigpty", spoolStage: stage },
    cause,
  });
}

/** Accounted size of one record under the memory bound. */
function chunkBytes(chunk: NativeChunk): number {
  if (chunk.kind === "text") return Buffer.byteLength(chunk.text, "utf8");
  if (chunk.kind === "bytes") return chunk.bytes.byteLength;
  throw new UniPtyError("unsupported", "the zigpty route never produces combined native chunks");
}

function writeFully(fd: number, buffer: Uint8Array): void {
  let offset = 0;
  while (offset < buffer.byteLength) {
    offset += writeSync(fd, buffer, offset, buffer.byteLength - offset, null);
  }
}

function readFully(fd: number, buffer: Buffer): void {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const read = readSync(fd, buffer, offset, buffer.byteLength - offset, null);
    if (read === 0) {
      throw new UniPtyError("unsupported", "the output spool file ended mid-record", {
        details: { substrate: "zigpty", spoolStage: "replay" },
      });
    }
    offset += read;
  }
}

/**
 * FIFO spool between the substrate's data callback and the private output
 * source. Appends land in an in-memory head; once the head exceeds
 * `memoryBytes` the WHOLE head flushes to a single lazily-created temp file
 * (append fd), so steady-state memory stays within `memoryBytes` plus one
 * record. Ordering is disk-records-first-then-head: a flush only ever
 * appends records older than everything still arriving, and the read side
 * advances a monotonic offset, so no wraparound or reordering is possible.
 *
 * Text records round-trip per complete record (UTF-8 encode → decode), which
 * is lossless because each `onData` string was already complete; chunk
 * boundaries are preserved, so the aggregate public stream is byte-identical
 * with and without the spool. All IO is synchronous: spilling happens inside
 * the substrate's already-synchronous data callback, and replay happens in
 * `pull()`/microtask pumps, where async IO would only reorder records.
 */
export class OutputSpool {
  private readonly memoryBytes: number;
  private readonly directory: string;
  private head: NativeChunk[] = [];
  private headBytes = 0;
  private writeFd: number | undefined;
  private readFd: number | undefined;
  private filePath: string | undefined;
  private diskWriteOffset = 0;
  private diskReadOffset = 0;
  private closed = false;

  constructor(options: OutputSpoolOptions) {
    this.memoryBytes = options.memoryBytes;
    this.directory = options.directory;
  }

  /** True when spilled records are still undelivered (memory bound exceeded). */
  get isBacklogged(): boolean {
    return this.diskReadOffset < this.diskWriteOffset;
  }

  /** True when no undelivered record remains, in memory or on disk. */
  get isEmpty(): boolean {
    return !this.isBacklogged && this.head.length === 0;
  }

  /** Undelivered bytes (memory head + on-disk payloads). */
  get pendingBytes(): number {
    let disk = this.diskWriteOffset - this.diskReadOffset;
    for (const chunk of this.head) disk += chunkBytes(chunk);
    return disk;
  }

  /** Filesystem path of the spill file once anything has spilled. */
  get spillPath(): string | undefined {
    return this.filePath;
  }

  /**
   * Admit one native chunk. May create the spill file and flush the head
   * through synchronous writes; IO failures propagate as typed
   * `UniPtyError`s so the Endpoint can fail the private source instead of
   * silently unbounding memory.
   */
  append(chunk: NativeChunk): void {
    if (this.closed) {
      throw new UniPtyError("closed", "the output spool was already closed");
    }
    this.head.push(chunk);
    this.headBytes += chunkBytes(chunk);
    if (this.headBytes > this.memoryBytes) {
      try {
        this.flushHead();
      } catch (cause) {
        throw cause instanceof UniPtyError ? cause : spoolFailure("append", cause);
      }
    }
  }

  /** Next undelivered record in FIFO order, or `undefined` when empty. */
  readNext(): NativeChunk | undefined {
    if (this.closed) return undefined;
    if (this.isBacklogged) {
      return this.readRecord();
    }
    const chunk = this.head.shift();
    if (chunk !== undefined) {
      this.headBytes -= chunkBytes(chunk);
    }
    return chunk;
  }

  /**
   * Release everything: drop the memory head, close both fds, and delete the
   * spill file. Idempotent; records already delivered stay delivered, and
   * undelivered ones are dropped (explicit-close/cancellation semantics).
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.head = [];
    this.headBytes = 0;
    const path = this.filePath;
    if (this.writeFd !== undefined) {
      try {
        closeSync(this.writeFd);
      } catch {
        // Best-effort teardown.
      }
      this.writeFd = undefined;
    }
    if (this.readFd !== undefined) {
      try {
        closeSync(this.readFd);
      } catch {
        // Best-effort teardown.
      }
      this.readFd = undefined;
    }
    if (path !== undefined) {
      try {
        unlinkSync(path);
      } catch {
        // An abruptly-ended process leaks the file to OS tmp reaping.
      }
    }
  }

  private ensureFile(): void {
    if (this.writeFd !== undefined) return;
    const path = join(
      this.directory,
      `unipty-spool-${process.pid}-${spillFileCounter++}-${randomUUID()}.tmp`,
    );
    // Two fds over one file: "a" always appends for the writer while the
    // "r" reader keeps its own sequential position — no shared-position
    // interference between concurrent spill and replay.
    this.writeFd = openSync(path, "a");
    this.readFd = openSync(path, "r");
    this.filePath = path;
  }

  private flushHead(): void {
    if (this.head.length === 0) return;
    this.ensureFile();
    try {
      const header = Buffer.allocUnsafe(RECORD_HEADER_BYTES);
      for (const chunk of this.head) {
        const payload: Uint8Array =
          chunk.kind === "text" ? Buffer.from(chunk.text, "utf8") : chunk.bytes;
        header.writeUInt8(chunk.kind === "text" ? RECORD_TEXT : RECORD_BYTES, 0);
        header.writeUInt32LE(payload.byteLength, 1);
        writeFully(this.writeFd as number, header);
        writeFully(this.writeFd as number, payload);
        this.diskWriteOffset += RECORD_HEADER_BYTES + payload.byteLength;
      }
    } catch (cause) {
      throw spoolFailure("append", cause);
    }
    this.head = [];
    this.headBytes = 0;
  }

  private readRecord(): NativeChunk {
    if (this.readFd === undefined) {
      throw new UniPtyError("unsupported", "the output spool lost its read handle", {
        details: { substrate: "zigpty", spoolStage: "replay" },
      });
    }
    try {
      const header = Buffer.allocUnsafe(RECORD_HEADER_BYTES);
      readFully(this.readFd, header);
      const kind = header.readUInt8(0);
      const length = header.readUInt32LE(1);
      const payload = Buffer.allocUnsafe(length);
      readFully(this.readFd, payload);
      this.diskReadOffset += RECORD_HEADER_BYTES + length;
      if (kind === RECORD_TEXT) {
        return { kind: "text", text: payload.toString("utf8") };
      }
      if (kind === RECORD_BYTES) {
        return { kind: "bytes", bytes: payload };
      }
      throw new UniPtyError("unsupported", "the output spool read an unknown record kind", {
        details: { substrate: "zigpty", spoolStage: "replay", kind },
      });
    } catch (cause) {
      throw cause instanceof UniPtyError ? cause : spoolFailure("replay", cause);
    }
  }
}

/** Validate and snapshot the public option shape into concrete options. */
export function normalizeOutputSpool(
  option: true | { readonly memoryBytes?: number; readonly directory?: string } | undefined,
): OutputSpoolOptions | undefined {
  if (option === undefined) return undefined;
  const memoryBytes =
    option === true
      ? DEFAULT_SPOOL_MEMORY_BYTES
      : (option.memoryBytes ?? DEFAULT_SPOOL_MEMORY_BYTES);
  if (!Number.isInteger(memoryBytes) || memoryBytes <= 0) {
    throw new UniPtyError(
      "invalid-argument",
      "outputSpool.memoryBytes must be a positive integer",
      {
        details: { memoryBytes },
      },
    );
  }
  const directory = option === true ? tmpdir() : (option.directory ?? tmpdir());
  if (typeof directory !== "string" || directory.length === 0) {
    throw new UniPtyError("invalid-argument", "outputSpool.directory must be a non-empty string", {
      details: { directory },
    });
  }
  return { memoryBytes, directory };
}
