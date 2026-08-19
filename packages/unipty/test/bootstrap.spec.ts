import { describe, expect, it } from "vitest";
import { setupPty } from "./support/mock-backend.ts";
import { collectStream, flushMicrotasks, takeFirst } from "./support/helpers.ts";

describe("bootstrap output buffer", () => {
  it("delivers pre-stream chunks to the first view in emission order", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("first");
    endpoint.pushText("second");
    endpoint.pushText("third");
    await endpoint.waitForDelivered(3);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    expect(await collected).toEqual(["first", "second", "third"]);
  });

  it("interleaves retained and post-subscription chunks in order", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("retained");
    await endpoint.waitForDelivered(1);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.pushText("live");
    await endpoint.waitForDelivered(2);
    endpoint.endOutput();
    expect(await collected).toEqual(["retained", "live"]);
  });

  it("retains the native byte representation so split multibyte output still decodes", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "bytes", output: "bytes" } });
    endpoint.pushBytes(new Uint8Array([0xe4]));
    endpoint.pushBytes(new Uint8Array([0xbd, 0xa0]));
    await endpoint.waitForDelivered(2);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    expect((await collected).join("")).toBe("你");
  });

  it("discards bootstrap-era chunks once every established view has detached", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("startup");
    await endpoint.waitForDelivered(1);
    const first = pty.stream({ encoding: "utf8" });
    expect(await takeFirst(first, 1)).toEqual(["startup"]);
    await flushMicrotasks();

    // No consumer exists: Core keeps draining and discards.
    endpoint.pushText("dropped-a");
    endpoint.pushText("dropped-b");
    await endpoint.waitForDelivered(3);
    const late = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.pushText("only-for-late");
    await endpoint.waitForDelivered(4);
    endpoint.endOutput();
    expect(await late).toEqual(["only-for-late"]);
  });
});
