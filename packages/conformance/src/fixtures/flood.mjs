/**
 * Deterministic child fixture: writes ~8.6 MiB of fixed-width patterned
 * output ("FLOOD-<index>-<padding>\n", 72 bytes per line), then
 * "FLOOD-DONE\n", then exits 0. Started before the first Terminal Stream,
 * it exercises the bounded Bootstrap Output Buffer, output backpressure, and
 * ordered first-view delivery without truncation.
 *
 * The pattern parameters are mirrored by FLOOD_SPEC in
 * src/fixtures/fixtures.ts.
 */

const LINE_COUNT = 120000;
const INDEX_WIDTH = 8;
const PAD_WIDTH = 56;
const TAIL = "FLOOD-DONE\n";

let index = 0;

function line(n) {
  return "FLOOD-" + String(n).padStart(INDEX_WIDTH, "0") + "-" + "P".repeat(PAD_WIDTH) + "\n";
}

function pump() {
  while (index < LINE_COUNT) {
    const parts = [];
    while (index < LINE_COUNT && parts.length < 1000) {
      parts.push(line(index));
      index += 1;
    }
    const ok = process.stdout.write(parts.join(""));
    if (!ok) {
      process.stdout.once("drain", pump);
      return;
    }
  }
  process.stdout.write(TAIL, () => {
    process.exitCode = 0;
  });
}

pump();
