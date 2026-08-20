import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { NewTerminalDialog } from "@/components/NewTerminalDialog";
import { TerminalPane } from "@/components/TerminalPane";
import { BACKENDS, type BackendId, cn } from "@/lib/utils";

interface TabEntry {
  readonly id: string;
  readonly backend: BackendId;
  readonly createdAt: number;
  exited: boolean;
}

let nextTabId = 1;

export default function App() {
  const [tabs, setTabs] = useState<TabEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");

  const createTab = useCallback((backend: BackendId) => {
    const id = `tab-${nextTabId++}`;
    setTabs((previous) => [...previous, { id, backend, createdAt: Date.now(), exited: false }]);
    setActiveTab(id);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((previous) => previous.filter((tab) => tab.id !== id));
      setActiveTab((previousActive) => {
        if (previousActive !== id) return previousActive;
        const remaining = tabs.filter((tab) => tab.id !== id);
        return remaining.length > 0 ? (remaining[remaining.length - 1]?.id ?? "") : "";
      });
    },
    [tabs],
  );

  const markExited = useCallback((id: string) => {
    setTabs((previous) => previous.map((tab) => (tab.id === id ? { ...tab, exited: true } : tab)));
  }, []);

  const runtimeBadge = useMemo(
    () => Object.fromEntries(BACKENDS.map((entry) => [entry.id, entry])),
    [],
  );

  return (
    <div className="flex h-dvh flex-col gap-3 p-4">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">UniPty Example</h1>
          <p className="text-sm text-muted-foreground">
            one contract · three runtimes · WebSocket terminals
          </p>
        </div>
        <NewTerminalDialog onCreate={createTab} />
      </header>

      {tabs.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground">
          <p className="text-sm">No terminals yet.</p>
          <p className="text-xs">
            Click <span className="font-medium text-foreground">New</span> and pick a backend —
            node, bun, or deno will each host a real PTY.
          </p>
        </main>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col gap-2"
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            {tabs.map((tab) => {
              const badge = runtimeBadge[tab.backend];
              return (
                <div key={tab.id} className="group/tab relative flex-none">
                  <TabsTrigger value={tab.id} className={cn("pr-7", tab.exited && "opacity-60")}>
                    {badge?.label ?? tab.backend}
                    {tab.exited ? " · exited" : ""}
                  </TabsTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-sm opacity-0 transition-opacity group-hover/tab:opacity-100"
                    onClick={() => closeTab(tab.id)}
                    aria-label={`Close ${badge?.label ?? tab.backend} terminal`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </TabsList>

          {tabs.map((tab) => (
            // forceMount keeps every terminal (WebSocket + xterm + shell)
            // alive across tab switches: Radix unmounts inactive content by
            // default, which would kill the PTY session on every switch.
            // Inactive panes are hidden by Radix's `hidden` attribute instead.
            <TabsContent key={tab.id} value={tab.id} forceMount className="min-h-0 flex-1">
              <div className="h-full overflow-hidden rounded-lg border border-border">
                <TerminalPane
                  backend={tab.backend}
                  tabId={tab.id}
                  onExit={(id) => markExited(id)}
                  active={activeTab === tab.id}
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
