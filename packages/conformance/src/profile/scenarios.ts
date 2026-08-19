/**
> Orthogonal intents (2026-08-20): the backend-agnostic Core conformance
> profile (tasks 4.1, 4.2).
>
> Every scenario drives the Backend ONLY through public surfaces: the
> factory-supplied ready Backend, `new UniPty({ backend })`, public `Pty`
> operations, and deterministic child fixtures. Requirements of the
> `runtime-neutral-pty` and `pty-backend-seam` specs map to these named
 * scenarios through src/profile/traceability.ts.
 */

import { defineCapabilityToken, UniPty } from "unipty";
import type { Pty, ReadyPtyBackend } from "unipty";
import {
  buildFloodExpected,
  childArgv,
  FLOOD_TAIL,
  MARKER_TEXT,
  UTF8_SPLIT_TAIL,
  UTF8_SPLIT_TEXT,
} from "../fixtures/fixtures.ts";
import type { ScenarioWorld } from "./world.ts";
import {
  concatBytes,
  delay,
  encodeUtf8,
  errorCodeOf,
  expectSyncErrorCode,
  expectedDefaultGeometry,
  invariant,
  normalizeTtyBytes,
  readReaderToCompletion,
  settledWithin,
  withHostGeometryEnv,
  withTimeout,
  withoutHostGeometryEnv,
} from "./util.ts";

/** Scenario outcome: `void` = pass, string = pass with note, `{skip}` = recorded skip. */
export type ScenarioOutcome = void | string | { readonly skip: string };

/** One named scenario definition. */
export interface ScenarioDef {
  readonly name: string;
  readonly timeoutMs: number;
  readonly requirement: string;
  run(world: ScenarioWorld): Promise<ScenarioOutcome>;
}

/** Shell metacharacters that must remain ordinary structured launch data. */
const METACHARACTER_ARGS = [
  "a; b",
  "$HOME",
  "|pipe",
  "quote's",
  'dq"x',
  "back\\slash",
  "*glob*",
  "  spaced  ",
];

/**
 * Termination exit honesty: backends normally report a non-zero exit or an
 * observed signal; a substrate whose termination primitive destroys the
 * observation channel (declared accommodation) settles null/null instead,
 * which is recorded as a note rather than a failure.
 */
function assertTerminatedExit(
  exited: { exitCode: number | null; signal: string | null },
  world: ScenarioWorld,
): string | undefined {
  if (exited.exitCode !== 0 && exited.exitCode !== null) return undefined;
  if (exited.signal !== null) return undefined;
  if (world.ctx.accommodations.exitUnobservableAfterTerminate === true) {
    return "terminate() settled the exit observation as unobservable on this substrate (kill and transport teardown are one primitive)";
  }
  throw new Error(
    `terminated child must report a non-zero exit or a signal per backend honesty (got ${JSON.stringify(exited)})`,
  );
}

function scenario(
  name: string,
  timeoutMs: number,
  requirement: string,
  run: (world: ScenarioWorld) => Promise<ScenarioOutcome>,
): ScenarioDef {
  return { name, timeoutMs, requirement, run };
}

/**
 * The ordered Core conformance profile. Names are stable identifiers used by
 * the traceability mapping and reports.
 */
export const SCENARIOS: readonly ScenarioDef[] = [
  scenario(
    "seam/synchronous-spawn",
    20000,
    "pty-backend-seam::Ready Backend injection",
    async (world) => {
      const unipty = await world.ready();
      const result: unknown = world.spawn(childArgv("marker"));
      invariant(
        typeof result === "object" && result !== null && !(result instanceof Promise),
        "spawn() must synchronously return the public Pty, never a Promise",
      );
      const pty = result as Pty;
      invariant(
        typeof pty.stream === "function" &&
          typeof pty.write === "function" &&
          typeof pty.close === "function",
        "spawn() must return the public Pty surface (stream/write/close)",
      );
      const exited = await withTimeout(pty.exited, 10000, "marker exited");
      invariant(exited.exitCode === 0, `marker child must exit 0 (got ${JSON.stringify(exited)})`);
    },
  ),

  scenario(
    "launch/structured-argv",
    25000,
    "runtime-neutral-pty::Configured Core and structured launch",
    async (world) => {
      const pty = world.spawn(childArgv("args-echo", METACHARACTER_ARGS));
      const text = await world.collectText(pty, 15000);
      const expected = METACHARACTER_ARGS.map((arg) => `${arg}\n`).join("");
      invariant(
        text === expected,
        `argv values must round-trip verbatim without shell evaluation:\nexpected ${JSON.stringify(expected)}\ngot      ${JSON.stringify(text)}`,
      );
      const exited = await withTimeout(pty.exited, 5000, "args-echo exited");
      invariant(exited.exitCode === 0, `args-echo must exit 0 (got ${JSON.stringify(exited)})`);
    },
  ),

  scenario(
    "launch/empty-argv-rejected",
    10000,
    "runtime-neutral-pty::Configured Core and structured launch",
    async (world) => {
      const unipty = await world.ready();
      expectSyncErrorCode(() => unipty.spawn([]), "invalid-argument");
    },
  ),

  scenario(
    "launch/geometry-explicit",
    25000,
    "runtime-neutral-pty::Terminal geometry resolution",
    async (world) => {
      const pty = world.spawnFixture("report-size", [], { terminal: { cols: 101, rows: 37 } });
      const reader = pty.stream({ encoding: "utf8" }).getReader();
      await world.readUntil(
        reader,
        (text) => text.includes("SIZE 101 37\n"),
        "explicit geometry observed by child",
        15000,
      );
      await world.detach(reader);
    },
  ),

  scenario(
    "launch/geometry-env-fallback",
    30000,
    "runtime-neutral-pty::Terminal geometry resolution",
    async (world) => {
      const restore = withHostGeometryEnv({ COLUMNS: "97", LINES: "31" });
      try {
        const pty = world.spawnFixture("report-size");
        const reader = pty.stream({ encoding: "utf8" }).getReader();
        await world.readUntil(
          reader,
          (text) => text.includes("SIZE 97 31\n"),
          "host COLUMNS/LINES geometry fallback observed by child",
          20000,
        );
        await world.detach(reader);
      } finally {
        restore();
      }
    },
  ),

  scenario(
    "launch/geometry-default-fallback",
    30000,
    "runtime-neutral-pty::Terminal geometry resolution",
    async (world) => {
      const restore = withoutHostGeometryEnv();
      try {
        const expected = expectedDefaultGeometry();
        const pty = world.spawnFixture("report-size");
        const reader = pty.stream({ encoding: "utf8" }).getReader();
        await world.readUntil(
          reader,
          (text) => text.includes(`SIZE ${expected.cols} ${expected.rows}\n`),
          `default geometry ${expected.cols}x${expected.rows} observed by child`,
          20000,
        );
        await world.detach(reader);
      } finally {
        restore();
      }
    },
  ),

  scenario(
    "launch/geometry-partial",
    30000,
    "runtime-neutral-pty::Terminal geometry resolution",
    async (world) => {
      const restore = withoutHostGeometryEnv();
      try {
        const expectedRows = expectedDefaultGeometry().rows;
        const pty = world.spawnFixture("report-size", [], { terminal: { cols: 63 } });
        const reader = pty.stream({ encoding: "utf8" }).getReader();
        await world.readUntil(
          reader,
          (text) => text.includes(`SIZE 63 ${expectedRows}\n`),
          `partial geometry (explicit cols, ${expectedRows} rows fallback) observed by child`,
          20000,
        );
        await world.detach(reader);
      } finally {
        restore();
      }
    },
  ),

  scenario(
    "launch/geometry-invalid-rejected",
    10000,
    "runtime-neutral-pty::Terminal geometry resolution",
    async (world) => {
      const unipty = await world.ready();
      const argv = childArgv("sleep-forever");
      const invalid: ReadonlyArray<{ cols?: number; rows?: number }> = [
        { cols: 0, rows: 10 },
        { cols: 10, rows: -3 },
        { cols: 1.5, rows: 10 },
        { cols: Number.NaN, rows: 10 },
        { cols: 10, rows: Number.POSITIVE_INFINITY },
      ];
      for (const terminal of invalid) {
        expectSyncErrorCode(() => unipty.spawn(argv, { terminal }), "invalid-argument");
      }
    },
  ),

  scenario(
    "stream/utf8-native-or-decoded",
    35000,
    "runtime-neutral-pty::Representation-selecting terminal stream",
    async (world) => {
      const pty = world.spawnFixture("utf8-split");
      const text = await world.collectText(pty, 30000);
      const expected = UTF8_SPLIT_TEXT + UTF8_SPLIT_TAIL;
      invariant(
        text === expected,
        `multibyte text must reconstruct exactly across chunk boundaries:\nexpected ${JSON.stringify(expected)}\ngot      ${JSON.stringify(text)}`,
      );
      const exited = await withTimeout(pty.exited, 5000, "utf8-split exited");
      invariant(exited.exitCode === 0, `utf8-split must exit 0 (got ${JSON.stringify(exited)})`);
    },
  ),

  scenario(
    "stream/bytes-fidelity",
    25000,
    "pty-backend-seam::Ordered native output and independent exit observation",
    async (world) => {
      const pty = world.spawnFixture("marker");
      let reader: ReadableStreamDefaultReader<Uint8Array>;
      try {
        reader = pty.stream({ encoding: "bytes" }).getReader();
      } catch (error) {
        if (errorCodeOf(error) === "unsupported") {
          return "bytes view explicitly rejected with unsupported (text-only backend output; text is never re-encoded as native bytes)";
        }
        throw error;
      }
      const chunks = await withTimeout(
        readReaderToCompletion(reader),
        15000,
        "bytes stream completion",
      );
      const received = normalizeTtyBytes(concatBytes(chunks));
      const expected = encodeUtf8(MARKER_TEXT);
      invariant(
        received.byteLength === expected.byteLength &&
          received.every((byte, index) => byte === expected[index]),
        `native bytes must match exactly (${received.byteLength} bytes received, ${expected.byteLength} expected)`,
      );
      const exited = await withTimeout(pty.exited, 5000, "marker exited");
      invariant(exited.exitCode === 0, `marker must exit 0 (got ${JSON.stringify(exited)})`);
    },
  ),

  scenario(
    "stream/one-active",
    25000,
    "runtime-neutral-pty::Representation-selecting terminal stream",
    async (world) => {
      const pty = world.spawnFixture("echo-stream");
      const firstReader = pty.stream({ encoding: "utf8" }).getReader();
      await world.awaitEchoReady(firstReader);
      expectSyncErrorCode(() => pty.stream({ encoding: "utf8" }), "active-stream");
      await world.detach(firstReader);
      const second = pty.stream({ encoding: "utf8" });
      const reader = second.getReader();
      pty.write("post-cancel-line\n");
      await world.readUntil(
        reader,
        (text) => text.includes("post-cancel-line\n"),
        "post-detachment stream receives new output",
        10000,
      );
      await world.detach(reader);
    },
  ),

  scenario(
    "stream/detach-only-view",
    35000,
    "runtime-neutral-pty::Representation-selecting terminal stream",
    async (world) => {
      const pty = world.spawnFixture("echo-stream");
      const firstReader = pty.stream({ encoding: "utf8" }).getReader();
      await world.awaitEchoReady(firstReader);
      pty.write("pre-detach-line\n");
      await world.readUntil(
        firstReader,
        (text) => text.includes("pre-detach-line\n"),
        "pre-detach echo",
        15000,
      );
      await world.detach(firstReader);

      // Detachment leaves the PTY operational: input accepted, drain settles.
      pty.write("discarded-line\n");
      await withTimeout(pty.drain(), 5000, "drain after detach");
      invariant(pty.closed === false, "detaching a view must not close the PTY");
      const childSettled = await settledWithin(pty.exited, 400);
      invariant(!childSettled, "detaching a view must not terminate the child");

      // Let the discarded echo drain; a later view must see future output only.
      await delay(300);
      const secondReader = pty.stream({ encoding: "utf8" }).getReader();
      pty.write("post-subscription-line\n");
      const postText = await world.readUntil(
        secondReader,
        (text) => text.includes("post-subscription-line\n"),
        "post-subscription echo",
        15000,
      );
      invariant(
        postText === "post-subscription-line\n",
        `a later view must receive only post-subscription output, no replay (got ${JSON.stringify(postText)})`,
      );
      await world.detach(secondReader);
    },
  ),

  scenario(
    "stream/bootstrap-order",
    120000,
    "runtime-neutral-pty::Bootstrap output and stream completion",
    async (world) => {
      const pty = world.spawnFixture("flood");
      // Produce far more than the bounded bootstrap buffer retains while no
      // view exists; the first view must still receive from the very
      // beginning, in order, without truncation.
      await delay(500);
      const text = await world.collectText(pty, 100000);
      const expected = buildFloodExpected() + FLOOD_TAIL;
      invariant(
        text === expected,
        `bootstrap buffer must preserve full ordered startup output without truncation (received ${text.length} chars, expected ${expected.length}; first-line match: ${text.startsWith("FLOOD-00000000-")}, tail match: ${text.endsWith(FLOOD_TAIL)})`,
      );
      const exited = await withTimeout(pty.exited, 10000, "flood exited");
      invariant(exited.exitCode === 0, `flood must exit 0 (got ${JSON.stringify(exited)})`);
    },
  ),

  scenario(
    "input/write-read",
    30000,
    "runtime-neutral-pty::Write readiness and advisory backpressure",
    async (world) => {
      const pty = world.spawnFixture("echo-stream");
      const reader = pty.stream({ encoding: "utf8" }).getReader();
      await world.awaitEchoReady(reader);
      const stringWrite = pty.write("string-input-line\n");
      invariant(typeof stringWrite === "boolean", "write() must return boolean Write Readiness");
      const firstEcho = await world.readUntil(
        reader,
        (text) => text.includes("string-input-line\n"),
        "string input echo",
        15000,
      );
      let note: string | undefined;
      try {
        const byteWrite = pty.write(encodeUtf8("byte-input-line\n"));
        invariant(
          typeof byteWrite === "boolean",
          "byte write() must return boolean Write Readiness",
        );
        const secondEcho = await world.readUntil(
          reader,
          (text) => text.includes("byte-input-line\n"),
          "byte input echo",
          15000,
        );
        // Each readUntil call returns only its own span; concatenate for the
        // cross-value order assertion.
        const echoText = firstEcho + secondEcho;
        const stringAt = echoText.indexOf("string-input-line\n");
        const byteAt = echoText.indexOf("byte-input-line\n");
        invariant(
          stringAt >= 0 && byteAt >= 0 && stringAt < byteAt,
          "input order must be preserved between accepted values",
        );
      } catch (error) {
        if (errorCodeOf(error) !== "unsupported") throw error;
        note =
          "byte input rejected with unsupported (strict text-only input; Backend write decoder not enabled)";
      }
      await world.detach(reader);
      return note;
    },
  ),

  scenario(
    "input/write-readiness",
    15000,
    "runtime-neutral-pty::Write readiness and advisory backpressure",
    async (world) => {
      const pty = world.spawnFixture("echo-stream");
      const readiness = pty.write("readiness-probe\n");
      invariant(typeof readiness === "boolean", "write() must return only boolean Write Readiness");
      await withTimeout(pty.drain(), 5000, "drain while ready resolves immediately");
    },
  ),

  scenario(
    "input/backpressure-saturation",
    120000,
    "runtime-neutral-pty::Write readiness and advisory backpressure",
    async (world) => {
      const pty = world.spawnFixture("echo-stream");
      const reader = pty.stream({ encoding: "utf8" }).getReader();
      const CHUNK_CHARS = 64 * 1024;
      const TOTAL_CHARS = 4 * 1024 * 1024;
      // Line-oriented payload: canonical-mode ttys deliver input per line, so
      // each accepted value ends with the newline the line discipline needs.
      const payload = `${"b".repeat(CHUNK_CHARS - 1)}\n`;
      await world.awaitEchoReady(reader);

      let receivedChars = 0;
      const readerLoop = (async () => {
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) return;
            // ONLCR echo folds back to the accepted payload length.
            if (chunk.value !== undefined) receivedChars += chunk.value.replace(/\r/g, "").length;
          }
        } catch {
          // transport errors fail the scenario through the round-trip check
        }
      })();
      void readerLoop;

      let acceptedChars = 0;
      let saturationRejections = 0;
      while (acceptedChars < TOTAL_CHARS) {
        try {
          const ok = pty.write(payload);
          invariant(typeof ok === "boolean", "write() must return boolean Write Readiness");
          acceptedChars += payload.length;
          if (!ok) {
            await withTimeout(pty.drain(), 30000, "drain after false readiness");
          }
        } catch (error) {
          if (errorCodeOf(error) !== "backpressure") throw error;
          saturationRejections += 1;
          // Law-level outcome: one whole value rejected with a typed failure
          // and zero partial acceptance. Recover, then retry the same whole
          // value once; a second immediate rejection ends the loop honestly.
          await withTimeout(pty.drain(), 30000, "drain after saturation");
          try {
            const retry = pty.write(payload);
            invariant(
              typeof retry === "boolean",
              "retry write() must return boolean Write Readiness",
            );
            acceptedChars += payload.length;
            if (!retry) await withTimeout(pty.drain(), 30000, "drain after retry false");
          } catch (retryError) {
            if (errorCodeOf(retryError) !== "backpressure") throw retryError;
            break;
          }
        }
      }

      // Every accepted character must round-trip eventually: no silent loss,
      // no partial acceptance escaping the typed whole-value failure.
      await withTimeout(
        (async () => {
          while (receivedChars < acceptedChars) {
            await delay(25);
          }
        })(),
        90000,
        "accepted input round-trip",
      );
      invariant(
        receivedChars === acceptedChars,
        `echo round-trip must be exact (accepted ${acceptedChars} chars, received ${receivedChars})`,
      );
      await reader.cancel();
      return saturationRejections > 0
        ? `observed ${saturationRejections} whole-value backpressure rejections; every accepted value round-tripped exactly`
        : undefined;
    },
  ),

  scenario(
    "resize/accepted-and-observed",
    45000,
    "pty-backend-seam::Backend wrapper extensibility",
    async (world) => {
      if (world.ctx.accommodations.resizeUnobservable === true) {
        return {
          skip: "transport cannot propagate geometry into the child's own tty view (pipe-based transport); resize acceptance is still exercised by errors/invalid-resize",
        };
      }
      const pty = world.spawnFixture("report-size", [], { terminal: { cols: 60, rows: 20 } });
      const reader = pty.stream({ encoding: "utf8" }).getReader();
      await world.readUntil(
        reader,
        (text) => text.includes("SIZE 60 20\n"),
        "initial geometry observed by child",
        15000,
      );
      try {
        pty.resize(120, 40);
      } catch (error) {
        if (errorCodeOf(error) === "unsupported") {
          await world.detach(reader);
          return { skip: "backend reports resize explicitly unsupported" };
        }
        throw error;
      }
      await world.readUntil(
        reader,
        (text) => text.includes("SIZE 120 40\n"),
        "resized geometry observed by child",
        30000,
      );
      invariant(pty.closed === false, "resize must not close the PTY");
      await world.detach(reader);
    },
  ),

  scenario(
    "errors/invalid-resize",
    15000,
    "runtime-neutral-pty::Resize, exit, and non-cascading lifecycle",
    async (world) => {
      const pty = world.spawnFixture("sleep-forever");
      const invalid: ReadonlyArray<[number, number]> = [
        [0, 24],
        [80, 0],
        [-1, 24],
        [80, -2],
        [80.5, 24],
        [Number.NaN, 24],
        [80, Number.POSITIVE_INFINITY],
        [80, Number.NaN],
      ];
      for (const [cols, rows] of invalid) {
        expectSyncErrorCode(() => pty.resize(cols, rows), "invalid-argument");
      }
      try {
        pty.resize(100, 30);
      } catch (error) {
        if (errorCodeOf(error) !== "unsupported") throw error;
        return "valid resize values validated by Core; this backend reports resize unsupported";
      }
    },
  ),

  scenario(
    "lifecycle/close-publishes-closed",
    30000,
    "runtime-neutral-pty::Resize, exit, and non-cascading lifecycle",
    async (world) => {
      const pty = world.spawnFixture("echo-stream");
      const reader = pty.stream({ encoding: "utf8" }).getReader();
      await world.awaitEchoReady(reader);
      pty.write("before-close\n");
      await world.readUntil(
        reader,
        (text) => text.includes("before-close\n"),
        "pre-close echo",
        15000,
      );
      pty.close();
      invariant(pty.closed === true, "close() must publish closed synchronously before returning");
      expectSyncErrorCode(() => pty.write("after\n"), "closed");
      expectSyncErrorCode(() => pty.resize(10, 10), "closed");
      expectSyncErrorCode(() => pty.stream({ encoding: "utf8" }), "closed");
      pty.close();
      const remainder = await withTimeout(
        readReaderToCompletion(reader),
        5000,
        "active stream completes normally on close",
      );
      invariant(
        Array.isArray(remainder),
        "the established stream must complete normally on explicit close, not error",
      );
      pty.terminate();
      await withTimeout(pty.exited, 10000, "child exits after post-close terminate");
    },
  ),

  scenario(
    "lifecycle/close-no-terminate",
    20000,
    "runtime-neutral-pty::Resize, exit, and non-cascading lifecycle",
    async (world) => {
      const pty = world.spawnFixture("sleep-forever");
      pty.close();
      invariant(pty.closed === true, "close() must publish closed synchronously");
      const settledEarly = await settledWithin(pty.exited, 600);
      invariant(
        !settledEarly,
        "close() alone must not terminate the child or synthesize an exit result",
      );
      pty.terminate();
      const exited = await withTimeout(
        pty.exited,
        10000,
        "exit observation remains settleable after close",
      );
      return assertTerminatedExit(exited, world);
    },
  ),

  scenario(
    "lifecycle/terminate-no-close",
    25000,
    "runtime-neutral-pty::Resize, exit, and non-cascading lifecycle",
    async (world) => {
      const pty = world.spawnFixture("sleep-forever");
      pty.terminate();
      invariant(pty.closed === false, "terminate() must not implicitly close the transport");
      const stream = pty.stream({ encoding: "utf8" });
      invariant(
        typeof stream === "object",
        "new stream creation must remain allowed after terminate()",
      );
      const exited = await withTimeout(pty.exited, 10000, "terminated child exit");
      const exitNote = assertTerminatedExit(exited, world);
      pty.close();
      const closedAfterTerminate = (): boolean => pty.closed;
      invariant(closedAfterTerminate() === true, "close after terminate must publish closed");
      return exitNote;
    },
  ),

  scenario(
    "lifecycle/terminate-idempotent",
    20000,
    "pty-backend-seam::Endpoint input, geometry, and lifecycle controls",
    async (world) => {
      const pty = world.spawnFixture("sleep-forever");
      pty.terminate();
      pty.terminate();
      const exited = await withTimeout(pty.exited, 10000, "exit after repeated terminate");
      const exitNote = assertTerminatedExit(exited, world);
      pty.close();
      pty.close();
      invariant(pty.closed === true, "close remains idempotent after terminate");
      return exitNote;
    },
  ),

  scenario(
    "lifecycle/exited-independent",
    30000,
    "pty-backend-seam::Ordered native output and independent exit observation",
    async (world) => {
      // Normal exit: stream completion (transport EOF) and exit observation
      // are reported separately; both must be observed for a zero exit.
      const markerPty = world.spawnFixture("marker");
      const markerText = await world.collectText(markerPty, 15000);
      invariant(markerText === MARKER_TEXT, "marker text must arrive exactly before completion");
      const markerExit = await withTimeout(markerPty.exited, 5000, "marker exit");
      invariant(
        markerExit.exitCode === 0,
        `marker must exit 0 (got ${JSON.stringify(markerExit)})`,
      );
      const repeatExit = await markerPty.exited;
      invariant(
        repeatExit.exitCode === markerExit.exitCode && repeatExit.signal === markerExit.signal,
        "exited must be repeatably awaitable with the same result",
      );

      // Non-zero exit: EOF does not synthesize the exit result and vice versa.
      const codePty = world.spawnFixture("exit-code", ["7"]);
      const exitReader = codePty.stream({ encoding: "utf8" }).getReader();
      await withTimeout(readReaderToCompletion(exitReader), 15000, "exit-code stream completion");
      const exited = await withTimeout(codePty.exited, 5000, "exit-code exit");
      invariant(
        exited.exitCode === 7,
        `exit-code child must exit 7 (got ${JSON.stringify(exited)})`,
      );
    },
  ),

  scenario(
    "capability/token-identity",
    25000,
    "pty-backend-seam::Typed Backend extension access",
    async (world) => {
      const pty = world.spawnFixture("marker");
      const unknownToken = defineCapabilityToken<{ readonly sample: true }>();
      const value = pty.capability(unknownToken);
      invariant(
        value === undefined,
        "lookup with an unregistered token object must return undefined (object identity only, no string-name fallback)",
      );
      const exited = await withTimeout(pty.exited, 15000, "marker exit");
      invariant(exited.exitCode === 0, `marker must exit 0 (got ${JSON.stringify(exited)})`);
      pty.close();
    },
  ),

  scenario(
    "disposal/graceful",
    40000,
    "runtime-neutral-pty::Graceful UniPty disposal",
    async (world) => {
      const backend = await world.createBackendRaw();
      let disposeCalls = 0;
      const wrapped: ReadyPtyBackend = {
        spawn: (launch) => backend.spawn(launch),
        dispose: async () => {
          disposeCalls += 1;
          await backend.dispose();
        },
      };
      const unipty = new UniPty({ backend: wrapped });
      world.useUnipty(unipty);
      const pty = world.spawn(childArgv("echo-stream"));
      const reader = pty.stream({ encoding: "utf8" }).getReader();
      await world.awaitEchoReady(reader);

      const first = unipty.dispose();
      const second = unipty.dispose();
      invariant(first === second, "repeated dispose() calls must return the same Promise");
      expectSyncErrorCode(() => unipty.spawn(childArgv("marker")), "closed");

      // Existing PTYs stay caller-owned and usable until they close.
      const writeOk = pty.write("still-alive\n");
      invariant(typeof writeOk === "boolean", "live PTY write must keep returning Write Readiness");
      await withTimeout(pty.drain(), 5000, "live PTY drain after disposal began");
      await world.readUntil(
        reader,
        (text) => text.includes("still-alive\n"),
        "live PTY echo after disposal began",
        15000,
      );
      invariant(pty.closed === false, "disposal must not implicitly close existing PTYs");
      invariant(disposeCalls === 0, "backend dispose must wait for all existing PTYs to close");

      pty.close();
      await withTimeout(first, 15000, "disposal promise settles after last PTY closes");
      const backendDisposeCalls = (): number => disposeCalls;
      invariant(
        backendDisposeCalls() === 1,
        `backend dispose must run exactly once (ran ${disposeCalls} times)`,
      );
      await reader.cancel().catch(() => {});
    },
  ),
];

/** Ordered stable scenario names. */
export const SCENARIO_NAMES: readonly string[] = SCENARIOS.map((def) => def.name);
