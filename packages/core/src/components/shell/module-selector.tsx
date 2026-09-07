"use client";

import { useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { useDismiss } from "../../hooks/use-dismiss";
import { cn } from "../../lib/utils";
import { ModuleIcon } from "./module-icon";
import type { ShellNavModule } from "./types";

/**
 * Module picker pinned above the AI-credits row, right below the businesses list --
 * opens upward (same pattern as SidebarAccountMenu below it) since there's no room
 * below its own trigger row. Picking a module closes the popover immediately and the
 * trigger row itself becomes that module's label/icon, so the drawer always shows
 * exactly one module's content (ModuleContent) above this row.
 */
export function ModuleSelector({
  modules,
  selectedKey,
  onSelect,
}: {
  modules: ShellNavModule[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useDismiss(containerRef, open, () => setOpen(false));

  const selected = modules.find((m) => m.key === selectedKey) ?? modules[0];

  return (
    <div ref={containerRef} className="relative border-t border-sidebar-border">
      {open ? (
        <div
          role="menu"
          className="absolute inset-x-0 bottom-full mb-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {modules.map((module) => (
            <button
              key={module.key}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(module.key);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent",
                module.key === selectedKey && "bg-accent font-medium",
              )}
            >
              <ModuleIcon name={module.icon} className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{module.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-sidebar-accent"
      >
        {selected ? (
          <ModuleIcon name={selected.icon} className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {selected?.name ?? "Select module"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </div>
  );
}
