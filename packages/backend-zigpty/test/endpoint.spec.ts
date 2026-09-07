/**
> Adapter-level real-PTY tests against the Core-private Endpoint seam.
>
> Every happy path drives a real child through a real pty on this machine —
> no substrate mocks. Tests read the NativeChunk source directly because Core
> is not under test here.
 */

import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createZigptyBackend } from "../src/index.ts";
import {
  awaitExit,
  cleanupEndpoint,
  errorCode,
  expectExit,
  launch,
  readOutputText,
} from "./helpers.ts";

const encoder = new TextEncoder();

describe("Endpoint output (bytes mode, default)", () => {
  it("runs /bin/echo and delivers native byte chunks with the echoed text", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "hello"]));
    const text = await readOutputText(endpoint, (acc) => acc.includes("hello"));
    expect(text).toContain("hello");
    await expectExit(endpoint, { exitCode: 0, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("treats shell metacharacters as plain data (argv, never a string command)", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "a; b"]));
    const text = await readOutputText(endpoint, (acc) => acc.includes("a; b"));
    expect(text).toContain("a; b");
    await expectExit(endpoint, { exitCode: 0, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("emits kind:bytes chunks carrying Uint8Array values", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "chunk-kind"]));
    const reader = endpoint.output.getReader();
    let sawBytesChunk = false;
    const timer = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("no bytes chunk observed")), 10_000).unref?.();
    });
    await Promise.race([
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.kind === "bytes" && value.bytes instanceof Uint8Array) {
            sawBytesChunk = true;
            break;
          }
        }
      })(),
      timer,
    ]);
    reader.releaseLock();
    expect(sawBytesChunk).toBe(true);
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("completes the output source after child exit (synthesized transport EOF)", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "eof"]));
    await readOutputText(endpoint, (acc) => acc.includes("eof"));
    await expectExit(endpoint, { exitCode: 0, signal: null });
    // The repossessed master stream reports the real end (or the quiescence
    // window bounds the wait); either way the source completes.
    const reader = endpoint.output.getReader();
    const timer = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("output source did not complete")), 5_000).unref?.();
    });
    const { done } = await Promise.race([reader.read(), timer]);
    reader.releaseLock();
    expect(done).toBe(true);
  }, 20_000);

  it("delivers output for rapid fast-exit children (linux exit-window regression)", async () => {
    // The substrate's fork-exit callback used to destroy its master stream
    // before kernel-buffered output was read: fast-exit children lost their
    // whole output when the exit callback won the first-read race (seen
    // deterministically on ubuntu CI cold starts). The Endpoint repossesses
    // the stream inside the exit window; pin that with a burst.
    const backend = await createZigptyBackend();
    for (let i = 0; i < 8; i += 1) {
      const endpoint = backend.spawn(launch(["/bin/echo", `burst-${i}`]));
      const text = await readOutputText(endpoint, (acc) => acc.includes(`burst-${i}`), 5_000);
      expect(text).toContain(`burst-${i}`);
      await expectExit(endpoint, { exitCode: 0, signal: null });
      endpoint.close();
    }
  }, 20_000);
});

describe("Endpoint input (bytes mode, strict text)", () => {
  it("writes text to /bin/cat and reads it back", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    // Warm up: wait until cat is alive (its echo path is ready once the pty
    // exists; a short settle avoids racing the very first write).
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(endpoint.write({ kind: "text", text: "text-input\n" })).toBe(true);
    await readOutputText(endpoint, (acc) => acc.includes("text-input"));
    await expect(endpoint.drain()).resolves.toBeUndefined();
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("rejects byte input on the strict text endpoint (substrate writes are string-only)", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    let caught: unknown;
    try {
      endpoint.write({ kind: "bytes", bytes: encoder.encode("x") });
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("unsupported");
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("accepts byte input in buffer mode when writeDecode is enabled", async () => {
    const backend = await createZigptyBackend({ encoding: "buffer", writeDecode: true });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(endpoint.write({ kind: "bytes", bytes: encoder.encode("bytes-input\n") })).toBe(true);
    await readOutputText(endpoint, (acc) => acc.includes("bytes-input"));
    cleanupEndpoint(endpoint);
  }, 20_000);
});

describe("Endpoint input (utf8 modes)", () => {
  it("accepts text and reports drain resolution (strict utf8)", async () => {
    const backend = await createZigptyBackend({ encoding: "utf8" });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(endpoint.write({ kind: "text", text: "utf8-plain\n" })).toBe(true);
    const text = await readOutputText(endpoint, (acc) => acc.includes("utf8-plain"));
    expect(text).toContain("utf8-plain");
    await expect(endpoint.drain()).resolves.toBeUndefined();
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("rejects byte input on a strict text endpoint (defense in depth)", async () => {
    const backend = await createZigptyBackend({ encoding: "utf8" });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    let caught: unknown;
    try {
      endpoint.write({ kind: "bytes", bytes: encoder.encode("x") });
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("unsupported");
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("decodes byte input through one stateful decoder when writeDecode is enabled", async () => {
    const backend = await createZigptyBackend({ encoding: "utf8", writeDecode: true });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    await new Promise((resolve) => setTimeout(resolve, 150));
    // "é" is 0xC3 0xA9; split it across two writes. A non-streaming decoder
    // would emit U+FFFD for each half.
    expect(
      endpoint.write({ kind: "bytes", bytes: Uint8Array.from([0x68, 0x63, 0x3a, 0x20, 0xc3]) }),
    ).toBe(true);
    expect(endpoint.write({ kind: "bytes", bytes: Uint8Array.from([0xa9, 0x0a]) })).toBe(true);
    const text = await readOutputText(endpoint, (acc) => acc.includes("hc: é"));
    expect(text).toContain("hc: é");
    expect(text).not.toContain("\uFFFD");
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("keeps writeDecode atomic under saturation: a rejected value never advances decoder state", async () => {
    // The codex round-2 counter-example: a byte value rejected by the
    // bounded queue must not have flowed through the stateful decoder, or
    // retrying the same bytes decodes them twice and corrupts the stream.
    const backend = await createZigptyBackend({
      encoding: "utf8",
      writeDecode: true,
      writeQueueBytes: 8,
    });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    await new Promise((resolve) => setTimeout(resolve, 150));
    // "xx" + 0xC3 (pending first half of "é") — admitted (3 bytes).
    expect(endpoint.write({ kind: "bytes", bytes: Uint8Array.from([0x78, 0x78, 0xc3]) })).toBe(
      true,
    );
    // Fill to 7/8 bytes so the completing pair cannot fit: whole-value
    // rejection, decoded state untouched.
    expect(endpoint.write({ kind: "text", text: "yyyy" })).toBe(false);
    let rejected: unknown;
    try {
      endpoint.write({ kind: "bytes", bytes: Uint8Array.from([0xa9, 0x0a]) });
    } catch (error) {
      rejected = error;
    }
    expect(errorCode(rejected)).toBe("backpressure");
    await endpoint.drain();
    // Retry the SAME bytes: the echo must be the exact original bytes
    // ("xx" + filler + "é") with no U+FFFD anywhere.
    expect(endpoint.write({ kind: "bytes", bytes: Uint8Array.from([0xa9, 0x0a]) })).toBe(true);
    const text = await readOutputText(endpoint, (acc) => acc.includes("xxyyyyé"), 5_000);
    expect(text).toContain("xxyyyyé");
    expect(text).not.toContain("\uFFFD");
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("fails the input surface terminally when admitted bytes hit a fatal decoder policy", async () => {
    const backend = await createZigptyBackend({
      encoding: "utf8",
      writeDecode: new TextDecoder("utf-8", { fatal: true }),
    });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    await new Promise((resolve) => setTimeout(resolve, 150));
    // Admission accepts the raw bytes; the fatal decode failure surfaces at
    // pump time and terminates the input surface.
    expect(endpoint.write({ kind: "bytes", bytes: Uint8Array.from([0xff, 0xfe, 0x0a]) })).toBe(
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(endpoint.drain()).rejects.toMatchObject({ code: "invalid-argument" });
    let caught: unknown;
    try {
      endpoint.write({ kind: "text", text: "late" });
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("invalid-argument");
    expect((caught as { cause?: unknown }).cause).toBeInstanceOf(TypeError);
    cleanupEndpoint(endpoint);
  }, 20_000);
});

describe("Endpoint geometry", () => {
  it("delivers initial cols/rows to the child tty", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(
      launch(
        [
          process.execPath,
          "-e",
          'process.stdout.write(process.stdout.columns + "x" + process.stdout.rows + "\\n")',
        ],
        { cols: 101, rows: 37 },
      ),
    );
    const text = await readOutputText(endpoint, (acc) => acc.includes("101x37"));
    expect(text).toContain("101x37");
    await expectExit(endpoint, { exitCode: 0, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("resizes the live pty observably from inside the child", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(
      launch([
        process.execPath,
        "-e",
        'process.stdout.write("READY\\n"); process.stdout.on("resize", () => { process.stdout.write("R" + process.stdout.columns + "x" + process.stdout.rows + "\\n"); process.exit(0); }); setTimeout(() => process.exit(1), 5000);',
      ]),
    );
    // Wait until the child actually listens before resizing.
    await readOutputText(endpoint, (acc) => acc.includes("READY"));
    expect(() => endpoint.resize(123, 45)).not.toThrow();
    const text = await readOutputText(endpoint, (acc) => acc.includes("R123x45"));
    expect(text).toContain("R123x45");
    await expectExit(endpoint, { exitCode: 0, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);
});

describe("Endpoint exit observation", () => {
  it("reports a normal exit code of 0 with no signal", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "done"]));
    await expectExit(endpoint, { exitCode: 0, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("reports a non-zero exit code from sh -c 'exit 7'", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/sh", "-c", "exit 7"]));
    await expectExit(endpoint, { exitCode: 7, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("reports exec failure as an exit observation, not a spawn exception", async () => {
    const backend = await createZigptyBackend();
    // The substrate fork+exec model cannot throw for a missing executable:
    // the child exits immediately (observed exit code 1). This pins the
    // documented substrate law.
    const endpoint = backend.spawn(launch(["/no/such/binary"]));
    await expectExit(endpoint, { exitCode: 1, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("is repeatably awaitable", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "repeat"]));
    const [first, second] = await Promise.all([endpoint.exited, endpoint.exited]);
    expect(first).toEqual(second);
    cleanupEndpoint(endpoint);
  }, 20_000);
});

describe("Endpoint lifecycle", () => {
  it("terminate() requests child termination with a signal and keeps the request idempotent", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/sleep", "30"]));
    endpoint.terminate();
    expect(() => endpoint.terminate()).not.toThrow();
    const result = await awaitExit(endpoint);
    expect(result.signal).toBe("SIGHUP"); // substrate kill() default signal
    expect(result.exitCode === null || typeof result.exitCode === "number").toBe(true);
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("close() releases the transport without terminating the child", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/sleep", "30"]));
    endpoint.close();
    expect(() => endpoint.close()).not.toThrow(); // idempotent

    // Post-close I/O surfaces fail with the closed code.
    let writeError: unknown;
    try {
      endpoint.write({ kind: "text", text: "late" });
    } catch (error) {
      writeError = error;
    }
    expect(errorCode(writeError)).toBe("closed");
    let resizeError: unknown;
    try {
      endpoint.resize(10, 10);
    } catch (error) {
      resizeError = error;
    }
    expect(errorCode(resizeError)).toBe("closed");

    // The child must stay alive for a grace period after transport close:
    // the substrate close would SIGHUP it, so the adapter defers the
    // substrate teardown past the exit observation.
    const grace = await Promise.race([
      endpoint.exited.then(() => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 700)),
    ]);
    expect(grace).toBe("pending");

    // The exit observation survives close and settles on true child death.
    endpoint.terminate();
    const result = await awaitExit(endpoint);
    expect(result.signal).not.toBeNull();
  }, 20_000);

  it("completes the private output source on close", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/sleep", "30"]));
    endpoint.close();
    const reader = endpoint.output.getReader();
    const { done } = await reader.read();
    expect(done).toBe(true);
    reader.releaseLock();
  }, 20_000);
});

describe("writeDecode decoder isolation and bounded write queue", () => {
  it("keeps decoder state per PTY: split sequences never leak across endpoints", async () => {
    const backend = await createZigptyBackend({ encoding: "utf8", writeDecode: true });
    const env = { PATH: "/usr/bin:/bin" };
    const a = backend.spawn(launch(["/bin/sh", "-c", "sleep 5"], { env }));
    const b = backend.spawn(launch(["/bin/sh", "-c", "sleep 5"], { env }));
    // "€" = E2 82 AC: the prefix goes to A, the suffix to B.
    a.write({ kind: "bytes", bytes: new Uint8Array([0xe2]) });
    b.write({ kind: "bytes", bytes: new Uint8Array([0x82, 0xac]) });
    const text = await readOutputText(b, (acc) => acc.includes("\u20ac") || acc.length > 0, 2_000);
    expect(text.includes("\u20ac")).toBe(false);
    cleanupEndpoint(a);
    cleanupEndpoint(b);
  });

  it("rejects a whole value with backpressure at the hard bound and recovers via drain", async () => {
    const backend = await createZigptyBackend({ writeQueueBytes: 4096 });
    const endpoint = backend.spawn(launch(["/bin/cat"], { env: { PATH: "/usr/bin:/bin" } }));
    let sawFalseReadiness = false;
    let saturated = false;
    for (let i = 0; i < 32; i += 1) {
      try {
        const readiness = endpoint.write({ kind: "text", text: `${"x".repeat(1023)}\n` });
        if (readiness === false) {
          sawFalseReadiness = true;
          break;
        }
      } catch (error) {
        expect(errorCode(error)).toBe("backpressure");
        saturated = true;
        break;
      }
    }
    expect(sawFalseReadiness || saturated).toBe(true);
    await endpoint.drain();
    const after = endpoint.write({ kind: "text", text: "after-drain\n" });
    expect(typeof after).toBe("boolean");
    await readOutputText(endpoint, (acc) => acc.includes("after-drain"), 10_000);
    cleanupEndpoint(endpoint);
  });
});

describe("output spool (disk-backed bounded memory)", () => {
  it("delivers a flood in full and in order to a slow reader, then cleans the spill file", async () => {
    const spillDirectory = mkdtempSync(join(tmpdir(), "unipty-endpoint-spool-"));
    try {
      const backend = await createZigptyBackend({
        outputSpool: { memoryBytes: 1024, directory: spillDirectory },
      });
      const lines = 2000;
      const script = `i=0; while [ "$i" -lt ${lines} ]; do printf '0123456789\\n'; i=$((i+1)); done`;
      const endpoint = backend.spawn(launch(["/bin/sh", "-c", script]));
      const reader = endpoint.output.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const started = Date.now();
      for (;;) {
        // A slow consumer: the spool absorbs the burst (memory head bound
        // 1 KiB against ~22 KiB of output) and replays at this pace.
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.kind === "bytes") text += decoder.decode(value.bytes, { stream: true });
        if (Date.now() - started < 4_000) await new Promise((r) => setTimeout(r, 1));
      }
      reader.releaseLock();
      expect(text.split("0123456789").length - 1).toBe(lines);
      await expectExit(endpoint, { exitCode: 0, signal: null });
      // Natural completion deleted the spill file.
      expect(readdirSync(spillDirectory)).toEqual([]);
      cleanupEndpoint(endpoint);
    } finally {
      rmSync(spillDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("keeps the fast-exit tail whole when every record must spill", async () => {
    const spillDirectory = mkdtempSync(join(tmpdir(), "unipty-endpoint-spool-"));
    try {
      const backend = await createZigptyBackend({
        outputSpool: { memoryBytes: 16, directory: spillDirectory },
      });
      for (let i = 0; i < 6; i += 1) {
        const endpoint = backend.spawn(launch(["/bin/echo", `spooled-tail-${i}`]));
        const text = await readOutputText(
          endpoint,
          (acc) => acc.includes(`spooled-tail-${i}`),
          5_000,
        );
        expect(text).toContain(`spooled-tail-${i}`);
        const reader = endpoint.output.getReader();
        const { done } = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("spooled source did not complete")), 5_000).unref?.();
          }),
        ]);
        reader.releaseLock();
        expect(done).toBe(true);
        endpoint.close();
      }
      expect(readdirSync(spillDirectory)).toEqual([]);
    } finally {
      rmSync(spillDirectory, { recursive: true, force: true });
    }
  }, 20_000);

  it("spools utf8 text records losslessly", async () => {
    const spillDirectory = mkdtempSync(join(tmpdir(), "unipty-endpoint-spool-"));
    try {
      const backend = await createZigptyBackend({
        encoding: "utf8",
        outputSpool: { memoryBytes: 8, directory: spillDirectory },
      });
      const endpoint = backend.spawn(launch(["/bin/echo", "héllo 世界 🦀"]));
      const reader = endpoint.output.getReader();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.kind === "text") text += value.text;
      }
      reader.releaseLock();
      expect(text).toContain("héllo 世界 🦀");
      expect(readdirSync(spillDirectory)).toEqual([]);
      cleanupEndpoint(endpoint);
    } finally {
      rmSync(spillDirectory, { recursive: true, force: true });
    }
  }, 20_000);

  it("explicit close drops undelivered spool output and deletes the spill file", async () => {
    const spillDirectory = mkdtempSync(join(tmpdir(), "unipty-endpoint-spool-"));
    try {
      const backend = await createZigptyBackend({
        outputSpool: { memoryBytes: 64, directory: spillDirectory },
      });
      const endpoint = backend.spawn(
        launch(["/bin/sh", "-c", "while :; do printf 'flood\\n'; done"]),
      );
      // Let the backlog build without ever reading.
      await new Promise((r) => setTimeout(r, 300));
      expect(readdirSync(spillDirectory).length).toBe(1);
      endpoint.terminate();
      endpoint.close();
      expect(readdirSync(spillDirectory)).toEqual([]);
      // Signalled death keeps the substrate-reported exitCode (0), never a
      // synthesized null — see the route's exit-observation law.
      await expectExit(endpoint, { exitCode: 0, signal: "SIGHUP" });
    } finally {
      rmSync(spillDirectory, { recursive: true, force: true });
    }
  }, 20_000);

  it("rejects malformed outputSpool options at readiness", async () => {
    await expect(createZigptyBackend({ outputSpool: { memoryBytes: 0 } })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("source cancellation lifecycle (transport release regression)", () => {
  it("completes cleanly after source cancellation: exit settles and no TTY handle lingers", async () => {
    // Regression (codex review R1): cancel() used to leave `streamDone`
    // pending; close() gates the deferred substrate teardown behind it, so
    // the transport release hung forever. On darwin the repossessed stream
    // self-destroys and closes the fd regardless, so the TTY-handle count
    // below cannot alone distinguish the bug — the load-bearing effect of
    // the settled gate is the substrate `close()` itself (Windows native
    // handles, write queue). This test pins the observable darwin contract:
    // cancel → terminate → close settles the exit observation and leaves no
    // TTY resource behind.
    const ttyHandles = () =>
      process.getActiveResourcesInfo().filter((name) => name.startsWith("TTY")).length;
    const baseline = ttyHandles();
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(
      launch(["/bin/sh", "-c", "echo cancellation-marker; exec /bin/sleep 30"]),
    );
    const reader = endpoint.output.getReader();
    const { value } = await reader.read();
    // The child printed its greeting; the read resolved.
    expect(value).toBeDefined();
    await reader.cancel();
    endpoint.terminate();
    endpoint.close();
    await expectExit(endpoint, { exitCode: 0, signal: "SIGHUP" });
    // The deferred release runs after exited settles; give the microtask
    // chain a moment, then require the TTY handle count back at baseline.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(ttyHandles()).toBeLessThanOrEqual(baseline);
  }, 20_000);

  it("rejects runtime-malformed outputSpool values with invalid-argument", async () => {
    for (const bad of [false, 42, "x", null, [{ memoryBytes: 1 }]]) {
      await expect(createZigptyBackend({ outputSpool: bad as never })).rejects.toMatchObject({
        code: "invalid-argument",
      });
    }
  });
});

describe("output spool edge cases (endpoint level)", () => {
  it("delivers the whole flood after the child already exited and EOF fired while nobody read", async () => {
    // Pins the deferred-completion law: the EOF trigger arrives while the
    // spool is backlogged and the consumer is fully stalled; completion and
    // delivery then happen purely at the consumer's later pace.
    const spillDirectory = mkdtempSync(join(tmpdir(), "unipty-endpoint-spool-"));
    try {
      const backend = await createZigptyBackend({
        outputSpool: { memoryBytes: 256, directory: spillDirectory },
      });
      const lines = 800;
      const script = `i=0; while [ "$i" -lt ${lines} ]; do printf 'edge-line\\n'; i=$((i+1)); done`;
      const endpoint = backend.spawn(launch(["/bin/sh", "-c", script]));
      const reader = endpoint.output.getReader();
      // Stall completely: acquire the reader, then do not read until the
      // child has exited and the quiescence window has long fired.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.kind === "bytes") text += decoder.decode(value.bytes, { stream: true });
      }
      reader.releaseLock();
      expect(text.split("edge-line").length - 1).toBe(lines);
      expect(readdirSync(spillDirectory)).toEqual([]);
      cleanupEndpoint(endpoint);
    } finally {
      rmSync(spillDirectory, { recursive: true, force: true });
    }
  }, 25_000);

  it("cancels mid-backlog and deletes the spill file without touching the exit observation", async () => {
    const spillDirectory = mkdtempSync(join(tmpdir(), "unipty-endpoint-spool-"));
    try {
      const backend = await createZigptyBackend({
        outputSpool: { memoryBytes: 64, directory: spillDirectory },
      });
      const endpoint = backend.spawn(
        launch(["/bin/sh", "-c", "while :; do printf 'cancel\\n'; done"]),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(readdirSync(spillDirectory).length).toBe(1);
      const reader = endpoint.output.getReader();
      await reader.read();
      await reader.cancel();
      expect(readdirSync(spillDirectory)).toEqual([]);
      endpoint.terminate();
      await expectExit(endpoint, { exitCode: 0, signal: "SIGHUP" });
      endpoint.close();
    } finally {
      rmSync(spillDirectory, { recursive: true, force: true });
    }
  }, 20_000);

  it("isolates concurrent endpoints spilling into one shared directory", async () => {
    const spillDirectory = mkdtempSync(join(tmpdir(), "unipty-endpoint-spool-"));
    try {
      const backend = await createZigptyBackend({
        outputSpool: { memoryBytes: 64, directory: spillDirectory },
      });
      const a = backend.spawn(launch(["/bin/echo", "iso-a"]));
      const b = backend.spawn(launch(["/bin/echo", "iso-b"]));
      const textA = await readOutputText(a, (acc) => acc.includes("iso-a"), 5_000);
      const textB = await readOutputText(b, (acc) => acc.includes("iso-b"), 5_000);
      expect(textA).toContain("iso-a");
      expect(textB).toContain("iso-b");
      a.close();
      b.close();
      expect(readdirSync(spillDirectory)).toEqual([]);
    } finally {
      rmSync(spillDirectory, { recursive: true, force: true });
    }
  }, 20_000);

  it("keeps input and resize live while the output spool is backlogged", async () => {
    const spillDirectory = mkdtempSync(join(tmpdir(), "unipty-endpoint-spool-"));
    try {
      const backend = await createZigptyBackend({
        outputSpool: { memoryBytes: 64, directory: spillDirectory },
      });
      // Disable the kernel echo so output is exactly what cat writes back
      // (otherwise every input byte appears twice: line-discipline echo plus
      // cat's own write). Echo disabling races our writes, so sync on a
      // marker first: it still echoes twice (line discipline plus cat), and
      // once both copies are back the payload lines no longer echo.
      const endpoint = backend.spawn(launch(["/bin/sh", "-c", "stty -echo; exec /bin/cat"]));
      endpoint.write({ kind: "text", text: "echo-sync-marker\n" });
      await readOutputText(endpoint, (acc) => acc.split("echo-sync-marker").length - 1 >= 2, 5_000);
      // Backlog builds while nobody reads; input still flows and resize is
      // accepted on the live transport. Canonical-mode ttys cap line length
      // at the kernel's line-discipline limit, so stay under it (1023 +
      // newline, matching the write-queue tests) and make up volume with
      // more lines.
      const payload = "x".repeat(1023);
      for (let i = 0; i < 24; i += 1) {
        expect(endpoint.write({ kind: "text", text: `${payload}\n` })).toBe(true);
      }
      endpoint.resize(120, 40);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(readdirSync(spillDirectory).length).toBe(1);
      const reader = endpoint.output.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const expectedXs = 24 * payload.length;
      const timer = new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `drained only ${[...text].filter((c) => c === "x").length}/${expectedXs} x-bytes`,
              ),
            ),
          10_000,
        ).unref?.();
      });
      await Promise.race([
        (async () => {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value?.kind === "bytes") text += decoder.decode(value.bytes, { stream: true });
            if ([...text].filter((c) => c === "x").length >= expectedXs) break;
          }
        })(),
        timer,
      ]);
      reader.releaseLock();
      // The line discipline renders line endings (CR injection on echo), so
      // the invariant is: every input byte echoed back as x, and nothing but
      // x / newline / carriage-return ever appears.
      expect([...text].filter((c) => c === "x").length).toBe(expectedXs);
      expect([...text].every((c) => c === "x" || c === "\n" || c === "\r")).toBe(true);
      cleanupEndpoint(endpoint);
      expect(readdirSync(spillDirectory)).toEqual([]);
    } finally {
      rmSync(spillDirectory, { recursive: true, force: true });
    }
  }, 25_000);
});
