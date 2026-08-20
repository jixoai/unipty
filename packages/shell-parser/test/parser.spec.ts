/**
> Orthogonal intents (2026-08-20): classification corpus for the Bash thin
 * wrapper — argv whitelist, shell-construct demotion, error triage.
 *
 * Original request (2026-08-20): parser conformance covers direct
 * invocations, quoting, empty arguments, incomplete input, unsupported
 * syntax, and constructs that require an explicit shell request.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/index.ts";

const argvCases: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["git status", ["git", "status"]],
  ["echo   spaced\ttabs", ["echo", "spaced", "tabs"]],
  ['echo "hello world"', ["echo", "hello world"]],
  ["echo 'single quoted'", ["echo", "single quoted"]],
  ["echo ''", ["echo", ""]],
  ["printf '%s\\n' x", ["printf", "%s\\n", "x"]],
  ["echo $'\\x41'", ["echo", "A"]],
  ["echo \"mixed\"'lit'", ["echo", "mixedlit"]],
  ['echo "*.txt"', ["echo", "*.txt"]],
  ["git log --oneline -5", ["git", "log", "--oneline", "-5"]],
  ["echo a#b", ["echo", "a#b"]],
  // Builtin-named commands stay lexical argv candidates; dispatch is the
  // caller's decision, never a parser-side builtin denylist.
  ["exec ls", ["exec", "ls"]],
  ["cd /tmp", ["cd", "/tmp"]],
];

const scriptCases: readonly string[] = [
  "a | b",
  "a |& b",
  "a && b",
  "a || b",
  "echo a;b",
  "ls > out.txt",
  "ls 2>&1",
  "cat <<EOF\nhi\nEOF",
  "sleep 1 &",
  "FOO=bar cmd arg",
  "x=1",
  "echo $HOME",
  "echo ${x}",
  "echo $(id)",
  "echo `id`",
  "echo $((1+1))",
  "ls *.txt",
  "ls [a-z]*",
  "[ -f x ]",
  "ls ~",
  "echo ~user/x",
  "echo {a,b}.txt",
  "echo ?(a|b)",
  "echo \\*",
  // Locale strings perform runtime localization; ANSI-C strings containing
  // NUL cannot become argv elements.
  'echo $"localized"',
  "echo $'\\0'",
  "echo $'a\\x00b'",
  "(cd /tmp)",
  "{ echo hi; }",
  "f() { echo hi; }",
  "[[ -f x ]]",
  "if true; then echo hi; fi",
  "for x in a b; do echo $x; done",
  "while true; do sleep 1; done",
  "case x in x) echo hi;; esac",
  "time ls",
  "! ls",
  "# just a comment",
  "#!/bin/bash\necho hi",
  "coproc ls",
  "select x in a b; do break; done",
  "(( 1+1 ))",
];

const incompleteCases: readonly string[] = [
  "echo 'unterminated",
  'echo "unterminated',
  "echo $(id",
  "ls |",
];

const invalidCases: readonly string[] = ["fi", "done", "esac", "echo )", "| ls", ""];

describe("parse: direct structured launch", () => {
  for (const [source, expected] of argvCases) {
    it(`classifies ${JSON.stringify(source)} as argv`, () => {
      const result = parse(source);
      expect(result).toStrictEqual({ kind: "argv", argv: expected });
    });
  }
});

describe("parse: explicit shell request", () => {
  for (const source of scriptCases) {
    it(`classifies ${JSON.stringify(source)} as script`, () => {
      const result = parse(source);
      expect(result).toStrictEqual({ kind: "script", language: "bash", source });
    });
  }
});

describe("parse: incomplete input", () => {
  for (const source of incompleteCases) {
    it(`classifies ${JSON.stringify(source)} as incomplete with positioned diagnostics`, () => {
      const result = parse(source);
      expect(result.kind).toBe("incomplete");
      if (result.kind !== "incomplete") return;
      expect(result.diagnostics.length).toBeGreaterThan(0);
      for (const diagnostic of result.diagnostics) {
        expect(diagnostic.message).toBeTruthy();
        expect(diagnostic.range?.start).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

describe("parse: invalid input", () => {
  for (const source of invalidCases) {
    it(`classifies ${JSON.stringify(source)} as invalid with diagnostics`, () => {
      const result = parse(source);
      expect(result.kind).toBe("invalid");
      if (result.kind !== "invalid") return;
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });
  }
});

describe("parse: contract guards", () => {
  it("returns argv as a plain readonly string array", () => {
    const result = parse("git status");
    if (result.kind !== "argv") throw new Error("expected argv");
    expect(Array.isArray(result.argv)).toBe(true);
    expect(result.argv.every((value) => typeof value === "string")).toBe(true);
  });

  it("never leaks unbash AST shapes into public results", () => {
    const results = [
      parse("git status"),
      parse("a | b"),
      parse("echo 'unterminated"),
      parse("echo $HOME"),
    ];
    const serialized = JSON.stringify(results);
    for (const leaked of ['"type":"Command"', '"pos"', '"endblock"', '"commands"']) {
      expect(serialized.includes(leaked)).toBe(false);
    }
  });
});
