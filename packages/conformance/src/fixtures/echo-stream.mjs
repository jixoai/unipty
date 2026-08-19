/**
 * Deterministic child fixture: pipes stdin to stdout byte-faithfully and
 * never exits on EOF (the keep-alive interval pins the event loop), so the
 * harness owns every termination explicitly.
 *
 * The fixture switches its tty to raw mode when one is attached, exactly
 * like a real terminal application: this disables local ECHO (which would
 * duplicate every echoed byte) and canonical line buffering (whose bounded
 * line length would corrupt bulk round-trips). Node exposes setRawMode
 * directly; Bun (1.3.14) lacks it, so the fallback shells out to `stty raw
 * -echo` through node:child_process, which all three target runtimes provide
 * for this fixture. Pipe transports are unaffected (both paths no-op).
 *
 * A one-time "ECHO-READY" line is emitted once raw mode is applied: bulk
 * input written before this handshake would land in the boot-time canonical
 * buffer and be dropped, so scenarios await the marker before writing.
 */

async function applyRawMode() {
  try {
    if (typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(true);
      return;
    }
  } catch {
    // fall through to the stty path
  }
  try {
    const { spawn } = await import("node:child_process");
    // stty drives the tty through ITS stdin; fd 0 explicitly points it at
    // this fixture's stdin (the pty slave), which works on Node, Bun, and
    // Deno children alike.
    await new Promise((resolve, reject) => {
      const child = spawn("stty", ["raw", "-echo"], {
        stdio: [0, "ignore", "ignore"],
      });
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`stty exited ${code}`)),
      );
    });
  } catch {
    // no tty attached: plain pipe semantics
  }
}

await applyRawMode();
process.stdout.write("ECHO-READY\n");
process.stdin.pipe(process.stdout);
setInterval(() => {}, 1 << 30);
