/**
 * Deterministic child fixture: writes fixed UTF-8 markers, then exits 0.
 *
 * Runtime-neutral by construction: it touches only `process.*` globals and
 * Web-platform globals, so the same file runs unchanged as a child under
 * Node, Bun, and Deno (`deno run marker.mjs` needs no permissions).
 */

process.stdout.write("MARKER-START\n");
process.stdout.write("MARKER-END\n");
process.exitCode = 0;
