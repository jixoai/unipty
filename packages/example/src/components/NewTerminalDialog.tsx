import { useState } from "react";
import { Plus, Terminal as TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BACKENDS, type BackendId } from "@/lib/utils";

export function NewTerminalDialog({
  onCreate,
  disabledBackends,
}: {
  onCreate: (backend: BackendId) => void;
  disabledBackends?: readonly BackendId[];
}) {
  const [open, setOpen] = useState(false);
  const [backend, setBackend] = useState<BackendId>("node-pty");
  const selected = BACKENDS.find((entry) => entry.id === backend);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground">
          <Plus /> New
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TerminalIcon className="h-4 w-4" /> New terminal tab
          </DialogTitle>
          <DialogDescription>
            Each tab is a real PTY driven through UniPty. The backend you pick decides which runtime
            hosts the terminal — all three speak the same WebSocket protocol.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="backend-select">
            Backend / runtime
          </label>
          <Select value={backend} onValueChange={(value) => setBackend(value as BackendId)}>
            <SelectTrigger id="backend-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Official first-phase routes</SelectLabel>
                {BACKENDS.map((entry) => (
                  <SelectItem
                    key={entry.id}
                    value={entry.id}
                    disabled={disabledBackends?.includes(entry.id) ?? false}
                  >
                    <span className="flex flex-col">
                      <span>
                        {entry.label} · runtime {entry.runtime}
                      </span>
                      <span className="text-xs text-muted-foreground">{entry.substrate}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {selected !== undefined && (
            <p className="text-xs text-muted-foreground">
              Spawned with{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                {selected.runtime === "node"
                  ? "node"
                  : selected.runtime === "bun"
                    ? "bun (in-process)"
                    : "deno run"}
              </code>{" "}
              over {selected.substrate}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              onCreate(backend);
            }}
          >
            Create terminal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
