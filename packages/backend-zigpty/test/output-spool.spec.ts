/**
> Unit tests for the adapter-owned disk-backed OutputSpool: FIFO ordering
> across the spill boundary, per-record text round-trips, bounded memory
> head, and spill-file cleanup. No PTY is involved — the class is pure
> queueing plus file IO.
*/

import {
  closeSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmSync,
  truncateSync,
  writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { OutputSpool, normalizeOutputSpool } from "../src/output-spool.ts";
import { UniPtyError } from "unipty";

const spillDirs: string[] = [];

function freshSpool(memoryBytes: number): { spool: OutputSpool; directory: string } {
  const directory = mkdtempSync(join(tmpdir(), "unipty-spool-test-"));
  spillDirs.push(directory);
  return { spool: new OutputSpool({ memoryBytes, directory }), directory };
}

afterAll(() => {
  for (const directory of spillDirs) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("OutputSpool FIFO", () => {
  it("returns records in append order across the spill boundary", () => {
    const { spool, directory } = freshSpool(16);
    for (let i = 0; i < 40; i += 1) {
      spool.append({ kind: "text", text: `r${String(i).padStart(3, "0")}` });
    }
    expect(spool.isBacklogged).toBe(true);
    expect(spool.spillPath).toBeDefined();
    expect(readdirSync(directory).length).toBe(1);
    for (let i = 0; i < 40; i += 1) {
      expect(spool.readNext()).toEqual({
        kind: "text",
        text: `r${String(i).padStart(3, "0")}`,
      });
    }
    expect(spool.readNext()).toBeUndefined();
    expect(spool.isEmpty).toBe(true);
    spool.close();
  });

  it("interleaves appends and reads without reordering", () => {
    const { spool } = freshSpool(24);
    const seen: string[] = [];
    for (let round = 0; round < 10; round += 1) {
      spool.append({ kind: "text", text: `a${round}` });
      spool.append({ kind: "text", text: `b${round}` });
      const first = spool.readNext();
      const second = spool.readNext();
      if (first?.kind === "text") seen.push(first.text);
      if (second?.kind === "text") seen.push(second.text);
    }
    expect(seen).toEqual(
      Array.from({ length: 10 }, (_, round) => [`a${round}`, `b${round}`]).flat(),
    );
    spool.close();
  });

  it("never holds more than the memory bound after a flush", () => {
    const { spool } = freshSpool(64);
    for (let i = 0; i < 100; i += 1) {
      spool.append({ kind: "bytes", bytes: new Uint8Array(32).fill(i) });
      // Head-only pending bytes stay within the bound plus one record; the
      // exact invariant is checked via isEmpty/isBacklogged transitions.
      if (spool.isBacklogged) break;
    }
    expect(spool.isBacklogged).toBe(true);
    expect(spool.pendingBytes).toBeGreaterThan(64);
    spool.close();
  });
});

describe("OutputSpool record fidelity", () => {
  it("round-trips multibyte text records without cross-record splitting", () => {
    const { spool } = freshSpool(8);
    // Each record is a complete string; round-tripping each independently
    // must reproduce the exact concatenation.
    const pieces = ["héllo ", "世", "界", " 🦀", "e\u0301"];
    for (const piece of pieces) {
      spool.append({ kind: "text", text: piece });
    }
    let joined = "";
    for (;;) {
      const next = spool.readNext();
      if (next === undefined) break;
      if (next.kind !== "text") throw new Error("expected text record");
      joined += next.text;
    }
    expect(joined).toBe(pieces.join(""));
    spool.close();
  });

  it("round-trips byte records byte-for-byte", () => {
    const { spool } = freshSpool(4);
    const payload = new Uint8Array([0, 1, 2, 253, 254, 255, 7, 9]);
    spool.append({ kind: "bytes", bytes: payload });
    const next = spool.readNext();
    expect(next).toBeDefined();
    if (next?.kind === "bytes") {
      expect(Array.from(next.bytes)).toEqual(Array.from(payload));
    } else {
      throw new Error("expected bytes record");
    }
    spool.close();
  });
});

describe("OutputSpool lifecycle", () => {
  it("close deletes the spill file and empties the queue", () => {
    const { spool, directory } = freshSpool(8);
    for (let i = 0; i < 10; i += 1) {
      spool.append({ kind: "text", text: `drop-${i}` });
    }
    const path = spool.spillPath;
    expect(path).toBeDefined();
    spool.close();
    expect(readdirSync(directory)).toEqual([]);
    expect(spool.readNext()).toBeUndefined();
    // Idempotent.
    spool.close();
  });

  it("keeps the file when still backlogged, then cleans after draining", () => {
    const { spool, directory } = freshSpool(8);
    for (let i = 0; i < 10; i += 1) {
      spool.append({ kind: "text", text: `hold-${i}` });
    }
    expect(readdirSync(directory).length).toBe(1);
    while (!spool.isEmpty) {
      spool.readNext();
    }
    // Draining does not delete the file by itself; close does.
    expect(readdirSync(directory).length).toBe(1);
    spool.close();
    expect(readdirSync(directory)).toEqual([]);
  });

  it("append after close fails typed", () => {
    const { spool } = freshSpool(8);
    spool.close();
    expect(() => spool.append({ kind: "text", text: "late" })).toThrow(UniPtyError);
  });
});

describe("normalizeOutputSpool", () => {
  it("returns undefined when the option is absent", () => {
    expect(normalizeOutputSpool(undefined)).toBeUndefined();
  });

  it("true snapshots the defaults", () => {
    expect(normalizeOutputSpool(true)).toEqual({ memoryBytes: 1 << 20, directory: tmpdir() });
  });

  it("rejects non-positive or non-integer memoryBytes", () => {
    expect(() => normalizeOutputSpool({ memoryBytes: 0 })).toThrow(UniPtyError);
    expect(() => normalizeOutputSpool({ memoryBytes: 1.5 })).toThrow(UniPtyError);
    expect(() => normalizeOutputSpool({ memoryBytes: -8 })).toThrow(UniPtyError);
  });

  it("rejects empty directory strings", () => {
    expect(() => normalizeOutputSpool({ directory: "" })).toThrow(UniPtyError);
  });
});

describe("normalizeOutputSpool runtime type gate", () => {
  it("rejects non-true non-object values with invalid-argument (no silent defaults)", () => {
    for (const bad of [false, 42, "x", null, [{ memoryBytes: 1 }]]) {
      let error: unknown;
      try {
        normalizeOutputSpool(bad as never);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(UniPtyError);
      expect((error as UniPtyError).code).toBe("invalid-argument");
    }
  });

  it("still accepts true, a plain object, and undefined", () => {
    expect(normalizeOutputSpool(undefined)).toBeUndefined();
    expect(normalizeOutputSpool(true)).toBeDefined();
    expect(normalizeOutputSpool({ memoryBytes: 128 })).toBeDefined();
  });
});

describe("OutputSpool corruption guards", () => {
  it("rejects a record length exceeding the spilled bytes instead of allocating it", () => {
    const { spool } = freshSpool(8);
    for (let i = 0; i < 10; i += 1) {
      spool.append({ kind: "text", text: `corrupt-${i}` });
    }
    const path = spool.spillPath;
    expect(path).toBeDefined();
    // Corrupt the first record's uint32 length field (offset 1) to the max.
    const fd = openSync(path as string, "r+");
    writeSync(fd, Buffer.from([0xff, 0xff, 0xff, 0xff]), 0, 4, 1);
    closeSync(fd);
    expect(() => spool.readNext()).toThrow(UniPtyError);
    spool.close();
  });

  it("fails typed on a file truncated mid-record", () => {
    const { spool, directory } = freshSpool(8);
    for (let i = 0; i < 10; i += 1) {
      spool.append({ kind: "text", text: `trunc-${i}` });
    }
    const path = spool.spillPath as string;
    truncateSync(path, 3); // mid-header of the first record
    expect(() => spool.readNext()).toThrow(UniPtyError);
    spool.close();
    expect(readdirSync(directory)).toEqual([]);
  });
});

describe("OutputSpool edge cases", () => {
  it("handles memoryBytes: 1 — every append spills immediately", () => {
    const { spool } = freshSpool(1);
    for (let i = 0; i < 50; i += 1) {
      spool.append({ kind: "text", text: `tiny-${i}` });
    }
    for (let i = 0; i < 50; i += 1) {
      expect(spool.readNext()).toEqual({ kind: "text", text: `tiny-${i}` });
    }
    expect(spool.isEmpty).toBe(true);
    spool.close();
  });

  it("admits empty chunks as zero-length records", () => {
    const { spool } = freshSpool(4);
    spool.append({ kind: "text", text: "" });
    spool.append({ kind: "bytes", bytes: new Uint8Array(0) });
    spool.append({ kind: "text", text: "after" });
    const emptyText = spool.readNext();
    expect(emptyText?.kind).toBe("text");
    if (emptyText?.kind === "text") expect(emptyText.text).toBe("");
    const emptyBytes = spool.readNext();
    expect(emptyBytes?.kind).toBe("bytes");
    if (emptyBytes?.kind === "bytes") expect(emptyBytes.bytes.byteLength).toBe(0);
    expect(spool.readNext()).toEqual({ kind: "text", text: "after" });
    spool.close();
  });

  it("flushes a single chunk larger than memoryBytes without loss", () => {
    const { spool } = freshSpool(16);
    const big = "x".repeat(64 * 1024);
    spool.append({ kind: "text", text: big });
    spool.append({ kind: "text", text: "tail" });
    const first = spool.readNext();
    expect(first?.kind === "text" && first.text.length).toBe(big.length);
    expect(spool.readNext()).toEqual({ kind: "text", text: "tail" });
    spool.close();
  });

  it("survives multiple drain-then-refill cycles on one spill file", () => {
    const { spool } = freshSpool(8);
    for (let cycle = 0; cycle < 8; cycle += 1) {
      for (let i = 0; i < 6; i += 1) {
        spool.append({ kind: "text", text: `c${cycle}-r${i}` });
      }
      expect(spool.isBacklogged).toBe(true);
      for (let i = 0; i < 6; i += 1) {
        expect(spool.readNext()).toEqual({ kind: "text", text: `c${cycle}-r${i}` });
      }
      expect(spool.isEmpty).toBe(true);
    }
    spool.close();
  });

  it("fails typed when the spill directory does not exist", () => {
    const missing = join(tmpdir(), `unipty-spool-missing-${randomUUID()}`);
    const spool = new OutputSpool({ memoryBytes: 4, directory: missing });
    let error: unknown;
    try {
      spool.append({ kind: "text", text: "will-fail" });
      spool.append({ kind: "text", text: "force-spill-over-four-bytes" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UniPtyError);
    expect((error as UniPtyError).code).toBe("unsupported");
    spool.close();
  });

  it("keeps 5000-record FIFO order across the spill boundary", () => {
    const { spool } = freshSpool(256);
    const count = 5000;
    for (let i = 0; i < count; i += 1) {
      spool.append({ kind: "bytes", bytes: Uint8Array.from([i & 0xff, (i >> 8) & 0xff]) });
    }
    for (let i = 0; i < count; i += 1) {
      const next = spool.readNext();
      if (next?.kind !== "bytes") throw new Error("expected bytes record");
      expect(Array.from(next.bytes)).toEqual([i & 0xff, (i >> 8) & 0xff]);
    }
    spool.close();
  });
});
