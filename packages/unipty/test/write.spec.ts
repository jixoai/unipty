import { describe, expect, it } from "vitest";
import type { NativeInput } from "../src/index.ts";
import { setupPty, utf8Bytes } from "./support/mock-backend.ts";
import { expectSyncCode } from "./support/helpers.ts";

describe("write representation selection", () => {
  it("delivers a string as native text to a text-native endpoint", () => {
    const { endpoint, pty } = setupPty({ native: { input: "text", output: "text" } });
    expect(pty.write("héllo")).toBe(true);
    expect(endpoint.acceptedWrites.length).toBe(1);
    expect(endpoint.acceptedWrites[0]).toEqual({
      kind: "text",
      text: "héllo",
    } satisfies NativeInput);
  });

  it("delivers a string as UTF-8-encoded native bytes to a byte-native endpoint", () => {
    const { endpoint, pty } = setupPty({ native: { input: "bytes", output: "bytes" } });
    expect(pty.write("你")).toBe(true);
    const input = endpoint.acceptedWrites[0];
    expect(input?.kind).toBe("bytes");
    if (input?.kind !== "bytes") return;
    expect(Array.from(input.bytes)).toEqual([0xe4, 0xbd, 0xa0]);
  });

  it("prefers native text for strings and native bytes for Uint8Array on a both endpoint", () => {
    const { endpoint, pty } = setupPty({ native: { input: "both", output: "both" } });
    pty.write("text-value");
    const payload = utf8Bytes("byte-value");
    pty.write(payload);
    expect(endpoint.acceptedWrites[0]).toEqual({
      kind: "text",
      text: "text-value",
    } satisfies NativeInput);
    const byteInput = endpoint.acceptedWrites[1];
    expect(byteInput?.kind).toBe("bytes");
    if (byteInput?.kind !== "bytes") return;
    expect(byteInput.bytes).toBe(payload);
  });

  it("passes a Uint8Array through by reference to a byte-native endpoint", () => {
    const { endpoint, pty } = setupPty({ native: { input: "bytes", output: "bytes" } });
    const payload = new Uint8Array([1, 2, 3]);
    pty.write(payload);
    const input = endpoint.acceptedWrites[0];
    expect(input?.kind).toBe("bytes");
    if (input?.kind !== "bytes") return;
    expect(input.bytes).toBe(payload);
  });

  it("rejects byte input on a strict text-only endpoint without calling the backend", () => {
    const { endpoint, pty } = setupPty({ native: { input: "text", output: "text" } });
    expectSyncCode(() => pty.write(new Uint8Array([0x61])), "unsupported");
    expect(endpoint.writeAttempts.length).toBe(0);
    expect(endpoint.acceptedWrites.length).toBe(0);
  });
});

describe("write readiness", () => {
  it("passes the endpoint boolean through unchanged", () => {
    const { endpoint, pty } = setupPty({ writeSteps: [true, false] });
    expect(pty.write("one")).toBe(true);
    expect(pty.write("two")).toBe(false);
    // false still means the complete value was accepted exactly once.
    expect(endpoint.acceptedWrites.map((input) => input)).toHaveLength(2);
    expect(endpoint.writeAttempts.length).toBe(2);
  });

  it("accepts later writes after a false advisory result", () => {
    const { pty } = setupPty({ writeSteps: [false, true] });
    expect(pty.write("first")).toBe(false);
    expect(pty.write("second")).toBe(true);
  });

  it("keeps input order across writes", () => {
    const { endpoint, pty } = setupPty();
    pty.write("a");
    pty.write("b");
    pty.write("c");
    expect(
      endpoint.acceptedWrites.map((input) => (input.kind === "text" ? input.text : "")),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("write saturation", () => {
  it("propagates the endpoint backpressure failure without accepting the value", () => {
    const { endpoint, pty } = setupPty({ writeSteps: ["backpressure"] });
    expectSyncCode(() => pty.write("rejected"), "backpressure");
    expect(endpoint.writeAttempts.length).toBe(1);
    expect(endpoint.acceptedWrites.length).toBe(0);
  });

  it("admits only the values that were not rejected", () => {
    const { endpoint, pty } = setupPty({ writeSteps: [true, "backpressure", true] });
    expect(pty.write("kept")).toBe(true);
    expectSyncCode(() => pty.write("dropped"), "backpressure");
    expect(pty.write("also-kept")).toBe(true);
    expect(
      endpoint.acceptedWrites.map((input) => (input.kind === "text" ? input.text : "")),
    ).toEqual(["kept", "also-kept"]);
  });

  it("rejects write after close with closed and never reaches the endpoint", () => {
    const { endpoint, pty } = setupPty();
    pty.close();
    expectSyncCode(() => pty.write("late"), "closed");
    expect(endpoint.writeAttempts.length).toBe(0);
  });
});
