/**
 * Endpoint-level tests for @unipty/backend-deno-sigma__pty-ffi: real PTYs
 * through the vendored closure and vendored native library, covering launch,
 * byte output, input, geometry, exit observation, lifecycle truth, queue
 * bounds, and idempotency.
 *
 * Lifecycle facts under test are substrate truths (documented in README):
 * close() kills the child and drops the transport; terminate() funnels to the
 * same primitive; an unobserved exit settles as {exitCode: null, signal: null}.
 */

import type { BackendEndpoint } from "unipty";
import { assertEqual, collectUntil, makeBackend, settlePump, sleep } from "./helpers.ts";

function isUnix(): boolean {
  const os = (globalThis as { Deno?: { build?: { os?: string } } }).Deno?.build?.os;
  return os === "darwin" || os === "linux";
}

async function errorCode(action: () => unknown): Promise<string> {
  try {
    await action();
  } catch (e) {
    return (e as { code?: string }).code ?? "";
  }
  return "";
}

Deno.test("spawn echoes argv bytes and observes exit 0", async () => {
  const backend = await makeBackend();
  const endpoint = backend.spawn({ argv: ["/bin/echo", "hello", "world"], cols: 80, rows: 24 });
  assertEqual(endpoint.native, { input: "bytes", output: "bytes" });
  const { text, done } = await collectUntil(endpoint, (t) => t.includes("hello world"));
  assertEqual(text.trim(), "hello world");
  assertEqual(done, false);
  const exit = await endpoint.exited;
  assertEqual(exit, { exitCode: 0, signal: null });
  endpoint.close();
  await settlePump();
});

Deno.test("text and byte input reach a cat child and echo back", async () => {
  const backend = await makeBackend();
  const endpoint = backend.spawn({ argv: ["/bin/cat"], cols: 80, rows: 24 });
  await sleep(250); // let the child establish its tty before writing
  assertEqual(endpoint.write({ kind: "text", text: "ping\n" }), true);
  const phase1 = await collectUntil(endpoint, (t) => t.includes("ping"));
  assertEqual(endpoint.write({ kind: "bytes", bytes: new TextEncoder().encode("pong\n") }), true);
  const phase2 = await collectUntil(endpoint, (t) => t.includes("pong"), {
    reader: phase1.reader,
  });
  assertEqual(phase2.text.includes("pong"), true);
  await phase2.reader.cancel().catch(() => {});
  endpoint.close();
  await settlePump();
});

Deno.test("initial geometry reaches the child at spawn", async () => {
  if (!isUnix()) return;
  const backend = await makeBackend();
  const endpoint = backend.spawn({
    argv: ["/bin/sh", "-c", "stty size"],
    cols: 101,
    rows: 37,
  });
  const { text } = await collectUntil(endpoint, (t) => t.trim().length > 0);
  assertEqual(text.trim(), "37 101");
  assertEqual(await endpoint.exited, { exitCode: 0, signal: null });
  endpoint.close();
  await settlePump();
});

Deno.test("resize is observable by the child", async () => {
  if (!isUnix()) return;
  const backend = await makeBackend();
  const endpoint = backend.spawn({
    argv: ["/bin/sh", "-c", "stty size; sleep 0.6; stty size"],
    cols: 101,
    rows: 37,
  });
  // Wait for the FIRST stty line (initial geometry) before resizing, then
  // read the SECOND stty line to observe the resize landing.
  const phase1 = await collectUntil(endpoint, (t) => t.trim().length > 0);
  endpoint.resize(120, 40);
  const phase2 = await collectUntil(endpoint, (t) => t.trim().length > 0, {
    reader: phase1.reader,
    timeoutMs: 8_000,
  });
  assertEqual(phase1.text.trim(), "37 101"); // initial geometry reached the child
  assertEqual(phase2.text.trim(), "40 120"); // resize observed by the second stty
  await phase2.reader.cancel().catch(() => {});
  endpoint.close();
  await settlePump();
});

Deno.test("non-zero exit codes are observed", async () => {
  const backend = await makeBackend();
  const endpoint = backend.spawn({ argv: ["/bin/sh", "-c", "exit 7"], cols: 80, rows: 24 });
  assertEqual(await endpoint.exited, { exitCode: 7, signal: null });
  endpoint.close();
  await settlePump();
});

Deno.test("cwd and env reach the child", async () => {
  if (!isUnix()) return;
  const cwd = await Deno.makeTempDir({ prefix: "unipty-cwd-" });
  const backend = await makeBackend();
  const endpoint = backend.spawn({
    argv: ["/bin/sh", "-c", "pwd; echo $UNIPTY_TEST_VAR"],
    env: { UNIPTY_TEST_VAR: "marker-42" },
    cwd,
    cols: 80,
    rows: 24,
  });
  const { text } = await collectUntil(endpoint, (t) => t.includes("marker-42"));
  const lines = text.trim().split(/[\r\n]+/);
  const realCwd = await Deno.realPath(cwd);
  assertEqual(lines[0], realCwd);
  assertEqual(lines[1], "marker-42");
  endpoint.close();
  await settlePump();
});

Deno.test("malformed launch input fails with invalid-argument", async () => {
  const backend = await makeBackend();
  let code = "";
  try {
    backend.spawn({ argv: [], cols: 80, rows: 24 } as Parameters<typeof backend.spawn>[0]);
  } catch (e) {
    code = (e as { code?: string }).code ?? "";
  }
  assertEqual(code, "invalid-argument");
  await backend.dispose();
});

Deno.test("a missing executable produces a typed launch failure with cause", async () => {
  const backend = await makeBackend();
  let captured: { code?: string; cause?: unknown } = {};
  try {
    backend.spawn({ argv: ["/nonexistent/unipty-probe"], cols: 80, rows: 24 });
  } catch (e) {
    captured = e as { code?: string; cause?: unknown };
  }
  assertEqual(captured.code, "invalid-argument");
  assertEqual(captured.cause instanceof Error, true);
  await backend.dispose();
});

Deno.test("write rejects NUL and non-UTF-8 input explicitly", async () => {
  const backend = await makeBackend();
  const endpoint = backend.spawn({ argv: ["/bin/cat"], cols: 80, rows: 24 });
  await sleep(250);
  assertEqual(
    await errorCode(() => endpoint.write({ kind: "text", text: "a\0b" })),
    "invalid-argument",
  );
  assertEqual(
    await errorCode(() =>
      endpoint.write({ kind: "bytes", bytes: new Uint8Array([0x61, 0x00, 0x62]) }),
    ),
    "invalid-argument",
  );
  assertEqual(
    await errorCode(() => endpoint.write({ kind: "bytes", bytes: new Uint8Array([0xff, 0xfe]) })),
    "invalid-argument",
  );
  // Still healthy after the rejections:
  assertEqual(endpoint.write({ kind: "text", text: "still-alive\n" }), true);
  const collected = await collectUntil(endpoint, (t) => t.includes("still-alive"));
  await collected.reader.cancel().catch(() => {});
  endpoint.close();
  await settlePump();
});

Deno.test("bounded write queue: soft false, drain recovery, hard rejection", async () => {
  const backend = await makeBackend({ queue: { softBytes: 8, hardBytes: 16 } });
  const endpoint = backend.spawn({ argv: ["/bin/cat"], cols: 80, rows: 24 });
  await sleep(250);
  // Crossing the soft mark reports false; the value was accepted exactly once.
  assertEqual(endpoint.write({ kind: "text", text: "0123456789" }), false);
  // A value that cannot fit within the hard bound is rejected whole.
  assertEqual(
    await errorCode(() => endpoint.write({ kind: "text", text: "x".repeat(20) })),
    "backpressure",
  );
  // drain() recovers readiness; later writes succeed again.
  await endpoint.drain();
  assertEqual(endpoint.write({ kind: "text", text: "ok\n" }), true);
  const collected = await collectUntil(
    endpoint,
    (t) => t.includes("0123456789") && t.includes("ok"),
  );
  await collected.reader.cancel().catch(() => {});
  endpoint.close();
  await settlePump();
});

Deno.test("terminate signals the child and observes the exit through the live transport", async () => {
  const backend = await makeBackend();
  const endpoint = backend.spawn({ argv: ["/bin/sleep", "30"], cols: 80, rows: 24 });
  await sleep(250);
  endpoint.terminate();
  endpoint.terminate(); // idempotent
  // The child is signalled by pid (discovered around spawn) without closing
  // the transport, so the pump observes the real exit: signal deaths report
  // exit code 1 on this substrate and no signal is distinguishable.
  assertEqual(await endpoint.exited, { exitCode: 1, signal: null });
  endpoint.close(); // explicit close still publishes and tears down
  await settlePump();
});

Deno.test("close defers physical teardown: stream completes, child stays alive", async () => {
  if (!isUnix()) return;
  const marker = await Deno.makeTempFile({ prefix: "unipty-alive-" });
  await Deno.remove(marker);
  const backend = await makeBackend();
  const endpoint = backend.spawn({
    argv: ["/bin/sh", "-c", `sleep 20; touch ${marker}`],
    cols: 80,
    rows: 24,
  });
  await sleep(250);
  const watch = collectUntil(endpoint, () => false, { timeoutMs: 5_000 });
  endpoint.close();
  endpoint.close(); // idempotent
  const { done } = await watch; // active stream completes normally on close
  assertEqual(done, true);
  assertEqual(await errorCode(() => endpoint.write({ kind: "text", text: "x" })), "closed");
  assertEqual(await errorCode(() => endpoint.resize(80, 24)), "closed");
  // Logical close does not terminate the child: the exit observation stays
  // pending and the child remains alive past a grace window.
  const exitStillPending = await Promise.race([
    endpoint.exited.then(() => false),
    sleep(700).then(() => true),
  ]);
  assertEqual(exitStillPending, true);
  await sleep(1_000);
  assertEqual(
    await Deno.stat(marker).then(
      () => true,
      () => false,
    ),
    false,
  );
  // Explicit termination afterwards signals by pid and the live transport
  // observes the real exit (signal deaths report exit code 1 here).
  endpoint.terminate();
  assertEqual(await endpoint.exited, { exitCode: 1, signal: null });
  await settlePump();
});

Deno.test("an established exit observation survives close and repeats", async () => {
  const backend = await makeBackend();
  const endpoint = backend.spawn({ argv: ["/bin/echo", "done"], cols: 80, rows: 24 });
  const first = await endpoint.exited;
  assertEqual(first, { exitCode: 0, signal: null });
  endpoint.close();
  assertEqual(await endpoint.exited, first); // repeatably awaitable, same value
  await settlePump();
});

Deno.test("output cancellation only detaches; the child keeps running", async () => {
  const backend = await makeBackend();
  const endpoint = backend.spawn({ argv: ["/bin/cat"], cols: 80, rows: 24 });
  await sleep(250);
  assertEqual(endpoint.write({ kind: "text", text: "before\n" }), true);
  const collected = await collectUntil(endpoint, (t) => t.includes("before"));
  // Explicit detachment of the private source view:
  await collected.reader.cancel();
  // I/O surfaces remain usable after detachment (no kill, no transport close).
  assertEqual(endpoint.write({ kind: "text", text: "after-detach\n" }), true);
  const exitStillPending = await Promise.race([
    endpoint.exited.then(() => false),
    sleep(300).then(() => true),
  ]);
  assertEqual(exitStillPending, true); // child survived the detachment
  endpoint.close();
  await settlePump();
});

Deno.test("multiple independent PTYs from one backend", async () => {
  const backend = await makeBackend();
  const a = backend.spawn({ argv: ["/bin/echo", "a"], cols: 80, rows: 24 });
  const b = backend.spawn({ argv: ["/bin/sh", "-c", "exit 3"], cols: 80, rows: 24 });
  const { text } = await collectUntil(a, (t) => t.includes("a"));
  assertEqual(text.trim(), "a");
  assertEqual(await a.exited, { exitCode: 0, signal: null });
  assertEqual(await b.exited, { exitCode: 3, signal: null });
  a.close();
  b.close();
  await settlePump();
});

Deno.test("resize validates character-cell arguments", async () => {
  const backend = await makeBackend();
  const endpoint: BackendEndpoint = backend.spawn({ argv: ["/bin/cat"], cols: 80, rows: 24 });
  await sleep(250);
  assertEqual(await errorCode(() => endpoint.resize(0, 24)), "invalid-argument");
  assertEqual(await errorCode(() => endpoint.resize(80, 2.5)), "invalid-argument");
  assertEqual(await errorCode(() => endpoint.resize(NaN, 24)), "invalid-argument");
  endpoint.close();
  await settlePump();
});
