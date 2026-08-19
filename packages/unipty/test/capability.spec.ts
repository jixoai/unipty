import { describe, expect, it } from "vitest";
import { defineCapabilityToken } from "../src/index.ts";
import type { CapabilityToken } from "../src/index.ts";
import { setupPty } from "./support/mock-backend.ts";

interface KillCapability {
  kill(signal: string): void;
}

describe("capability lookup", () => {
  it("returns the registered payload for its token", () => {
    const token = defineCapabilityToken<KillCapability>();
    const payload: KillCapability = {
      kill: (signal: string) => {
        void signal;
      },
    };
    const capabilities = new Map<CapabilityToken<unknown>, unknown>([[token, payload]]);
    const { pty } = setupPty({ capabilities });
    expect(pty.capability(token)).toBe(payload);
  });

  it("returns undefined for an equal-looking token from another package copy", () => {
    const registered = defineCapabilityToken<KillCapability>();
    const duplicate = defineCapabilityToken<KillCapability>();
    const capabilities = new Map<CapabilityToken<unknown>, unknown>([
      [registered, { kill: () => {} }],
    ]);
    const { pty } = setupPty({ capabilities });
    // Both tokens are structurally empty objects; only identity may match.
    expect(pty.capability(duplicate)).toBeUndefined();
  });

  it("returns undefined when the backend registered no capabilities", () => {
    const { pty } = setupPty();
    expect(pty.capability(defineCapabilityToken<KillCapability>())).toBeUndefined();
  });

  it("serves several registered tokens independently", () => {
    const killToken = defineCapabilityToken<{ kill(signal: string): void }>();
    const titleToken = defineCapabilityToken<{ readonly title: string }>();
    const killPayload = { kill: () => {} };
    const titlePayload = { title: "worker" };
    const capabilities = new Map<CapabilityToken<unknown>, unknown>([
      [killToken, killPayload],
      [titleToken, titlePayload],
    ]);
    const { pty } = setupPty({ capabilities });
    expect(pty.capability(killToken)).toBe(killPayload);
    expect(pty.capability(titleToken)).toBe(titlePayload);
  });
});
