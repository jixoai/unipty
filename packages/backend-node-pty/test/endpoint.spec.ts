/**
> Adapter-level real-PTY tests against the Core-private Endpoint seam.
>
> Every happy path drives a real child through a real pty on this machine —
> no substrate mocks. Tests read the NativeChunk source directly because Core
> is not under test here.
 */

import { describe, expect, it } from "vitest";
import { createNodePtyBackend } from "../src/index.ts";
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
    const backend = await createNodePtyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "hello"]));
    const text = await readOutputText(endpoint, (acc) => acc.includes("hello"));
    expect(text).toContain("hello");
    await expectExit(endpoint, { exitCode: 0, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("treats shell metacharacters as plain data (argv, never a string command)", async () => {
    const backend = await createNodePtyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "a; b"]));
    const text = await readOutputText(endpoint, (acc) => acc.includes("a; b"));
    expect(text).toContain("a; b");
    await expectExit(endpoint, { exitCode: 0, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("emits kind:bytes chunks carrying Uint8Array values", async () => {
    const backend = await createNodePtyBackend();
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
});

describe("Endpoint input (bytes mode)", () => {
  it("writes text and bytes to /bin/cat and reads them back", async () => {
    const backend = await createNodePtyBackend();
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    // Warm up: wait until cat is alive (its echo path is ready once the pty
    // exists; a short settle avoids racing the very first write).
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(endpoint.write({ kind: "text", text: "text-input\n" })).toBe(true);
    await readOutputText(endpoint, (acc) => acc.includes("text-input"));
    expect(endpoint.write({ kind: "bytes", bytes: encoder.encode("bytes-input\n") })).toBe(true);
    await readOutputText(endpoint, (acc) => acc.includes("bytes-input"));
    await expect(endpoint.drain()).resolves.toBeUndefined();
    cleanupEndpoint(endpoint);
  }, 20_000);
});

describe("Endpoint input (utf8 modes)", () => {
  it("accepts text and reports drain resolution (strict utf8)", async () => {
    const backend = await createNodePtyBackend({ encoding: "utf8" });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(endpoint.write({ kind: "text", text: "utf8-plain\n" })).toBe(true);
    const text = await readOutputText(endpoint, (acc) => acc.includes("utf8-plain"));
    expect(text).toContain("utf8-plain");
    await expect(endpoint.drain()).resolves.toBeUndefined();
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("rejects byte input on a strict text endpoint (defense in depth)", async () => {
    const backend = await createNodePtyBackend({ encoding: "utf8" });
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
    const backend = await createNodePtyBackend({ encoding: "utf8", writeDecode: true });
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

  it("surfaces fatal decoder failures as typed invalid-argument", async () => {
    const backend = await createNodePtyBackend({
      encoding: "utf8",
      writeDecode: new TextDecoder("utf-8", { fatal: true }),
    });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    let caught: unknown;
    try {
      endpoint.write({ kind: "bytes", bytes: Uint8Array.from([0xff, 0xfe, 0x0a]) });
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
    const backend = await createNodePtyBackend();
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
    const backend = await createNodePtyBackend();
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
    const backend = await createNodePtyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "done"]));
    await expectExit(endpoint, { exitCode: 0, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("reports a non-zero exit code from sh -c 'exit 7'", async () => {
    const backend = await createNodePtyBackend();
    const endpoint = backend.spawn(launch(["/bin/sh", "-c", "exit 7"]));
    await expectExit(endpoint, { exitCode: 7, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("reports exec failure as an exit observation, not a spawn exception", async () => {
    const backend = await createNodePtyBackend();
    // The substrate fork+exec model cannot throw for a missing executable:
    // the child exits immediately. This pins the documented substrate law.
    const endpoint = backend.spawn(launch(["/no/such/binary"]));
    await expectExit(endpoint, { exitCode: 1, signal: null });
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("is repeatably awaitable", async () => {
    const backend = await createNodePtyBackend();
    const endpoint = backend.spawn(launch(["/bin/echo", "repeat"]));
    const [first, second] = await Promise.all([endpoint.exited, endpoint.exited]);
    expect(first).toEqual(second);
    cleanupEndpoint(endpoint);
  }, 20_000);
});

describe("Endpoint lifecycle", () => {
  it("terminate() requests child termination with a signal and keeps the request idempotent", async () => {
    const backend = await createNodePtyBackend();
    const endpoint = backend.spawn(launch(["/bin/sleep", "30"]));
    endpoint.terminate();
    expect(() => endpoint.terminate()).not.toThrow();
    const result = await awaitExit(endpoint);
    expect(result.signal).toBe("SIGHUP"); // substrate kill() default signal
    expect(result.exitCode === null || typeof result.exitCode === "number").toBe(true);
    cleanupEndpoint(endpoint);
  }, 20_000);

  it("close() releases the transport without terminating the child", async () => {
    const backend = await createNodePtyBackend();
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

    // The child must stay alive for a grace period after transport close.
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
    const backend = await createNodePtyBackend();
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
    const backend = await createNodePtyBackend({ encoding: "utf8", writeDecode: true });
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
    const backend = await createNodePtyBackend({ writeQueueBytes: 4096 });
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
