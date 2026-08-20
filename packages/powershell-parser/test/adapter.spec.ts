/**
> Orthogonal intents (2026-08-20): adapter corpus for the PowerShell
 * official-parser package — typed capability failures always run; host-
 * dependent classification runs when a pwsh host exists.
 *
 * Original request (2026-08-20): PowerShell fixtures are judged only by the
 * official parser; one language's grammar is never the other's oracle.
 */

import { describe, expect, it } from "vitest";
import { isPowershellHostAvailable, parsePowershell, PowershellParseError } from "../src/index.ts";

const BOGUS_HOST = "unipty-definitely-not-a-real-powershell-host";

// Probed once at collection time so skipIf sees the real host availability.
const hasHost = await isPowershellHostAvailable();

describe("parsePowershell: typed capability failures", () => {
  it("rejects with capability-unavailable for a missing host", async () => {
    await expect(parsePowershell("git status", { host: BOGUS_HOST })).rejects.toMatchObject({
      name: "PowershellParseError",
      code: "capability-unavailable",
    });
  });

  it("rejects with host-timeout when the budget is exhausted", async () => {
    await expect(
      parsePowershell("git status", { host: BOGUS_HOST, timeoutMs: 1 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof PowershellParseError &&
        (error.code === "host-timeout" || error.code === "capability-unavailable"),
    );
  });

  it("reports a missing default host explicitly, never a Bash-like result", async () => {
    if (hasHost) return;
    await expect(parsePowershell("echo hi")).rejects.toBeInstanceOf(PowershellParseError);
  });

  it("exposes PowershellParseError with a stable code", () => {
    const error = new PowershellParseError("capability-unavailable", "no host");
    expect(error.code).toBe("capability-unavailable");
    expect(error.name).toBe("PowershellParseError");
    expect(error).toBeInstanceOf(Error);
  });
});

describe.skipIf(!hasHost)("parsePowershell: official-parser classification", () => {
  const argvCases: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["git status", ["git", "status"]],
    ["git log --oneline -5", ["git", "log", "--oneline", "-5"]],
    ['echo "hello world"', ["echo", "hello world"]],
    ["echo 'single quoted'", ["echo", "single quoted"]],
    ['echo ""', ["echo", ""]],
    ["Write-Output value", ["Write-Output", "value"]],
    ["dotnet build -c Release", ["dotnet", "build", "-c", "Release"]],
    ["echo ]", ["echo", "]"]],
  ];

  const scriptCases: readonly string[] = [
    "a | b",
    "a > out.txt",
    "a 2>&1 | b",
    "echo $env:HOME",
    "echo $(1+1)",
    "$x = 1",
    'echo "a $b"',
    "if ($x) { a }",
    "foreach ($i in 1..3) { echo $i }",
    "a; b",
    "# just a comment",
    "function f { echo hi }",
    "echo @('a','b')",
    "cmdlet; cmdlet2",
  ];

  const incompleteCases: readonly string[] = ["echo 'unterminated", 'echo "unterminated', "a |"];

  const invalidCases: readonly string[] = [")", "}", ""];

  for (const [source, expected] of argvCases) {
    it(`classifies ${JSON.stringify(source)} as argv`, async () => {
      await expect(parsePowershell(source)).resolves.toStrictEqual({
        kind: "argv",
        argv: expected,
      });
    });
  }

  for (const source of scriptCases) {
    it(`classifies ${JSON.stringify(source)} as script`, async () => {
      await expect(parsePowershell(source)).resolves.toStrictEqual({
        kind: "script",
        language: "powershell",
        source,
      });
    });
  }

  for (const source of incompleteCases) {
    it(`classifies ${JSON.stringify(source)} as incomplete with official diagnostics`, async () => {
      const result = await parsePowershell(source);
      expect(result.kind).toBe("incomplete");
      if (result.kind !== "incomplete") return;
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]?.incomplete).toBe(true);
      expect(typeof result.diagnostics[0]?.message).toBe("string");
    });
  }

  for (const source of invalidCases) {
    it(`classifies ${JSON.stringify(source)} as invalid with diagnostics`, async () => {
      const result = await parsePowershell(source);
      expect(result.kind).toBe("invalid");
      if (result.kind !== "invalid") return;
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });
  }
});
