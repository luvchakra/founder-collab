"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Lock } from "lucide-react";
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
 *
 * Every module from module-registry is listed here regardless of entitlement -- an
 * unlicensed one (`module.licensed === false`) gets a muted label and a small lock icon
 * instead of being left out of the list entirely; picking it still calls `onSelect`, and
 * the caller (AppSidebar's `handleSelectModule`) is what actually redirects to the
 * business's not-licensed page instead of switching the drawer to it.
 *
 * Dashboard (top) and Admin (bottom) are plain navigation shortcuts, not licensed
 * modules from module-registry -- they don't have their own ModuleContent panel, so
 * picking one navigates straight there and closes the drawer instead of becoming the
 * trigger's persisted selection. Styled visibly lighter (muted color, no bold-when-
 * selected treatment, separated by a hairline) so they read as a different kind of row
 * from the modules in between.
 */
export function ModuleSelector({
  modules,
  selectedKey,
  onSelect,
  onNavigate,
}: {
  modules: ShellNavModule[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** Closes the whole sidebar drawer -- used by the Dashboard/Admin shortcuts, which
   * navigate directly rather than switching the drawer's own selected module. */
  onNavigate?: () => void;
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
          <Link
            href="/dashboard"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="flex items-center gap-2.5 rounded-sm px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent/60"
          >
            <ModuleIcon name="LayoutDashboard" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Dashboard</span>
          </Link>

          <div className="my-1 border-t border-border" />

          {modules.map((module) => (
            <button
              key={module.key}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(module.key);
                setOpen(false);
              }}
              aria-current={module.key === selectedKey ? "true" : undefined}
              title={module.licensed ? undefined : `${module.name} isn't licensed for this business`}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-sm border-l-2 px-3 py-2 text-left text-sm",
                !module.licensed
                  ? "border-transparent text-muted-foreground hover:bg-accent/60"
                  : module.key === selectedKey
                    ? "border-primary bg-accent font-medium text-accent-foreground"
                    : "border-transparent hover:bg-accent/60",
              )}
            >
              <ModuleIcon
                name={module.icon}
                className={cn("size-4 shrink-0", module.licensed ? "text-muted-foreground" : "text-muted-foreground/60")}
              />
              <span className="min-w-0 flex-1 truncate">{module.name}</span>
              {!module.licensed ? (
                <Lock className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
              ) : module.key === selectedKey ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : null}
            </button>
          ))}

          <div className="my-1 border-t border-border" />

          <Link
            href="/dashboard/settings/licenses"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="flex items-center gap-2.5 rounded-sm px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent/60"
          >
            <ModuleIcon name="Shield" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Admin</span>
          </Link>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 bg-sidebar-accent/40 px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent"
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
