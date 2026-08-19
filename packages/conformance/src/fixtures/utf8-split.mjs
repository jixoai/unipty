/**
 * Deterministic child fixture: writes a fixed multi-line text containing
 * multibyte characters (emoji + CJK) in small timed pieces so that PTY chunk
 * boundaries split UTF-8 sequences, then writes "UTF8-DONE\n" and exits 0.
 * This exercises incremental decoding across byte chunk boundaries.
 *
 * NOTE: the expected text is mirrored by UTF8_SPLIT_TEXT in
 * src/fixtures/fixtures.ts (the fixture is the behavioural source of truth;
 * the registry constant is the harness oracle and both are asserted in the
 * fixture unit tests).
 */

const encoder = new TextEncoder();
const TEXT = "utf8開始🎉この行は分割される\n第二行：漢字と絵文字🚀混在\nfin🎉fin\n";
const BYTES = encoder.encode(TEXT);
const PIECE_BYTES = 3;
const INTERVAL_MS = 30;

let offset = 0;
const timer = setInterval(() => {
  if (offset >= BYTES.length) return;
  process.stdout.write(BYTES.subarray(offset, offset + PIECE_BYTES));
  offset += PIECE_BYTES;
  if (offset >= BYTES.length) {
    clearInterval(timer);
    process.stdout.write(encoder.encode("UTF8-DONE\n"), () => {
      process.exitCode = 0;
    });
  }
}, INTERVAL_MS);
