/**
 * Deterministic child fixture: writes every user argv value (argv[2..]) on
 * its own line, then exits 0. This verifies structured launch end to end:
 * argv values — including shell metacharacters — must round-trip verbatim as
 * launch data, never as shell code.
 *
 * argv shape is uniform across runtimes for script execution:
 * Node `[node, script, ...args]`, Bun `[bun, script, ...args]`,
 * Deno `[deno, script, ...args]` (the "run" flag is not part of argv).
 */

const args = process.argv.slice(2);
for (const arg of args) {
  process.stdout.write(arg + "\n");
}
process.exitCode = 0;
