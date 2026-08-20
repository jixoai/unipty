import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { BackendId } from "@/lib/utils";

/**
 * One xterm.js terminal bound to one UniPty WebSocket.
 *
 * Wire protocol (mirrors server.ts):
 * - binary frames           → PTY bytes both ways
 * - text frames (JSON)      → control: resize / exit / error
 */
export function TerminalPane({
  backend,
  tabId,
  onExit,
  active,
}: {
  backend: BackendId;
  tabId: string;
  onExit: (tabId: string, exitCode: number | null, signal: string | null) => void;
  active: boolean;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  // xterm v6 virtualizes scrolling (no DOM scroll area), and its internal
  // viewport state resets to bottom when the element is re-shown after being
  // display:none. The buffer API is pure JS state: record viewportY on
  // deactivation, restore it on reactivation.
  const savedViewportYRef = useRef<number | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (holder === null) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", monospace',
      theme: {
        background: "#0b0b0d",
        foreground: "#e8e8ea",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(holder);
    terminalRef.current = terminal;
    terminal.write(`\x1b[90m· connecting ${backend} …\x1b[0m\r\n`);

    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?backend=${encodeURIComponent(backend)}`,
    );
    ws.binaryType = "arraybuffer";

    const sendResize = (cols: number, rows: number): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: "resize", cols, rows }));
      }
    };

    ws.onopen = () => {
      terminal.write("\x1b[2K\r");
      sendResize(terminal.cols, terminal.rows);
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        const message = JSON.parse(event.data) as {
          t: string;
          exitCode?: number | null;
          signal?: string | null;
          message?: string;
        };
        if (message.t === "exit") {
          terminal.write(
            `\r\n\x1b[90m· process exited (code ${String(message.exitCode ?? "null")}` +
              (message.signal !== null && message.signal !== undefined
                ? `, ${message.signal}`
                : "") +
              ")\x1b[0m\r\n",
          );
          onExit(tabId, message.exitCode ?? null, message.signal ?? null);
        } else if (message.t === "error") {
          terminal.write(`\r\n\x1b[31m· backend error: ${message.message}\x1b[0m\r\n`);
        }
        return;
      }
      terminal.write(new Uint8Array(event.data));
    };
    ws.onclose = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
    };
    ws.onerror = () => {
      terminal.write("\r\n\x1b[31m· websocket error\x1b[0m\r\n");
    };

    const dataDisposable = terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (holder.clientWidth === 0 || holder.clientHeight === 0) return;
      try {
        fit.fit();
        sendResize(terminal.cols, terminal.rows);
      } catch {
        // xterm throws when the element is hidden mid-fit.
      }
    });
    resizeObserver.observe(holder);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      terminal.dispose();
      terminalRef.current = null;
    };
    // One connection per tab for its whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal === null) return;
    if (active) {
      // Reactivation: restore the viewport line the user left. A null record
      // means the pane was never deactivated — leave xterm untouched.
      const restore = savedViewportYRef.current;
      if (restore === null) return;
      savedViewportYRef.current = null;
      requestAnimationFrame(() => {
        try {
          terminal.scrollToLine(restore);
        } catch {
          // pane already disposed
        }
      });
    } else {
      // Deactivation: buffer state is plain JS, readable even while hidden.
      try {
        savedViewportYRef.current = terminal.buffer.active.viewportY;
      } catch {
        // pane already disposed
      }
    }
  }, [active]);

  return <div ref={holderRef} className="h-full w-full overflow-hidden bg-[#0b0b0d]" />;
}
