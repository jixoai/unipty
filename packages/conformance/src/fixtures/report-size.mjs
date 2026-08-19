/**
 * Deterministic child fixture: reports the terminal geometry observable from
 * the child's own view as "SIZE cols rows" lines, re-writing the line only
 * when it changes (polled every 100ms). This is how conformance observes
 * spawn geometry and resize through the child, never through Backend
 * internals.
 *
 * Geometry resolution inside the child, per dimension:
 * 1. `process.stdout.columns`/`rows` — the child's own tty view under Node
 *    (the honest path; Bun 1.3.14 leaves these undefined).
 * 2. `stty size` — the portable fallback: Node, Bun, and Deno all provide
 *    node:child_process for this fixture, and stty reports the controlling
 *    tty's live geometry, including after resizes.
 * 3. `COLUMNS`/`LINES` from the child environment — a documented fallback
 *    for non-TTY test transports (the pipe-based mock backend emulates
 *    geometry through it).
 * 4. `?` — the dimension is unobservable; the scenario then fails honestly.
 */

function dimension(ttyValue, envValue) {
  if (typeof ttyValue === "number" && Number.isInteger(ttyValue) && ttyValue > 0) {
    return String(ttyValue);
  }
  if (typeof envValue === "string" && /^[0-9]+$/.test(envValue)) {
    const parsed = Number(envValue);
    if (Number.isInteger(parsed) && parsed > 0) return String(parsed);
  }
  return "?";
}

let last = "";

function report(sttySize) {
  // stty reads the live tty geometry (including post-resize); the runtime's
  // stdout.columns snapshot is only a boot-time fallback (Bun 1.3.14 never
  // refreshes it), so the live source wins whenever it is available.
  const cols = sttySize?.cols ?? process.stdout.columns;
  const rows = sttySize?.rows ?? process.stdout.rows;
  const line =
    "SIZE " +
    dimension(cols, process.env.COLUMNS) +
    " " +
    dimension(rows, process.env.LINES) +
    "\n";
  if (line !== last) {
    last = line;
    process.stdout.write(line);
  }
}

let pollBusy = false;
async function pollStty() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    // Runtime-native live probe first: Deno exposes consoleSize per fd and
    // it reflects resizes immediately (the process.stdout.columns snapshot
    // under Deno/Bun children never updates).
    const deno = globalThis.Deno;
    if (typeof deno?.consoleSize === "function" && typeof deno.stdout?.rid === "number") {
      try {
        const size = deno.consoleSize(deno.stdout.rid);
        if (size.columns > 0 && size.rows > 0) {
          report({ cols: size.columns, rows: size.rows });
          return;
        }
      } catch {
        // stdout is not a tty here; continue to the stty path.
      }
    }
    const { spawnSync } = await import("node:child_process");
    // stty reads the tty from ITS stdin; passing fd 0 explicitly points it
    // at this fixture's own stdin (the pty slave) and works on Node and Bun
    // (whose stdio "inherit" is unreliable).
    const viaFd0 = spawnSync("stty", ["size"], { stdio: [0, "pipe", "pipe"], encoding: "utf8" });
    let stdout = viaFd0.stdout ?? "";
    if (viaFd0.status !== 0) {
      // Controlling-terminal fallback for hosts where fd 0 is not the tty.
      const viaDevTty = spawnSync("sh", ["-c", "stty size < /dev/tty"], { encoding: "utf8" });
      stdout = viaDevTty.stdout ?? "";
    }
    const match = /\s*(\d+)\s+(\d+)\s*/.exec(stdout);
    if (match !== null) {
      report({ rows: Number(match[1]), cols: Number(match[2]) });
      return;
    }
  } catch {
    // probes unavailable: fall back to the other paths
  } finally {
    pollBusy = false;
  }
  report(null);
}

report(null);
setInterval(() => {
  void pollStty();
}, 100);
