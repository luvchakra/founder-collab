"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Lock, Pin } from "lucide-react";
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
 *
 * Pinning (`pinnedKey`) locks the drawer to one module: every other module row becomes
 * disabled/inert until `onTogglePin` unpins it. The pin toggle itself lives next to the
 * trigger's chevron -- a separate button with its own stopPropagation, since clicking
 * the trigger row otherwise just opens/closes the dropdown.
 */
export function ModuleSelector({
  modules,
  selectedKey,
  onSelect,
  onNavigate,
  pinnedKey,
  onTogglePin,
}: {
  modules: ShellNavModule[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** Closes the whole sidebar drawer -- used by the Dashboard/Admin shortcuts, which
   * navigate directly rather than switching the drawer's own selected module. */
  onNavigate?: () => void;
  /** The module key currently pinned, if any -- every other module row is disabled
   * while this is set. */
  pinnedKey?: string | null;
  /** Pins the currently selected module, or unpins whatever's pinned. */
  onTogglePin?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useDismiss(containerRef, open, () => setOpen(false));

  const selected = modules.find((m) => m.key === selectedKey) ?? modules[0];
  const pinned = Boolean(pinnedKey);

  return (
    <div ref={containerRef} className="relative border-t border-sidebar-border">
      {open ? (
        <div
          role="menu"
          className="absolute inset-x-0 bottom-full mb-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {pinned ? (
            <div className="mb-1 flex items-center justify-between gap-2 rounded-sm bg-accent/60 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Pin className="size-3 shrink-0 fill-current" aria-hidden="true" />
                Pinned to {selected?.name}
              </span>
              <button
                type="button"
                onClick={() => onTogglePin?.()}
                className="font-medium text-primary hover:underline"
              >
                Unpin
              </button>
            </div>
          ) : null}

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
            <span className="min-w-0 flex-1 truncate">Executive Dashboard</span>
          </Link>

          <div className="my-1 border-t border-border" />

          {modules.map((module) => {
            const isSelected = module.key === selectedKey;
            const lockedByPin = pinned && !isSelected;
            return (
              <button
                key={module.key}
                type="button"
                role="menuitem"
                disabled={lockedByPin}
                onClick={() => {
                  onSelect(module.key);
                  setOpen(false);
                }}
                aria-current={isSelected ? "true" : undefined}
                title={
                  lockedByPin
                    ? `Unpin ${selected?.name} to switch modules`
                    : module.licensed
                      ? undefined
                      : `${module.name} isn't licensed for this business`
                }
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-sm border-l-2 px-3 py-2 text-left text-sm",
                  lockedByPin
                    ? "cursor-not-allowed border-transparent text-muted-foreground/50"
                    : !module.licensed
                      ? "border-transparent text-muted-foreground hover:bg-accent/60"
                      : isSelected
                        ? "border-primary bg-accent font-medium text-accent-foreground"
                        : "border-transparent hover:bg-accent/60",
                )}
              >
                <ModuleIcon
                  name={module.icon}
                  className={cn(
                    "size-4 shrink-0",
                    lockedByPin ? "text-muted-foreground/40" : module.licensed ? "text-muted-foreground" : "text-muted-foreground/60",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{module.name}</span>
                {/* The lock icon means "not licensed," never "temporarily inert because
                    another module is pinned" -- a licensed module that's merely locked
                    by the pin shows no trailing icon at all (its muted row styling
                    above already conveys "disabled"); only a genuinely unlicensed
                    module keeps the lock regardless of pin state. */}
                {!module.licensed ? (
                  <Lock
                    className={cn("size-3.5 shrink-0", lockedByPin ? "text-muted-foreground/40" : "text-muted-foreground/60")}
                    aria-hidden="true"
                  />
                ) : isSelected ? (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}

          <div className="my-1 border-t border-border" />

          <Link
            href="/dashboard/settings"
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

      <div className="flex w-full items-center gap-1 bg-sidebar-accent/40 px-2 py-1.5 transition-colors hover:bg-sidebar-accent">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm px-1 py-1 text-left"
        >
          {selected ? (
            <ModuleIcon name={selected.icon} className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {selected?.name ?? "Select module"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        {onTogglePin ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            title={pinned ? `Unpin -- currently pinned to ${selected?.name}` : `Pin ${selected?.name ?? "this module"}`}
            className={cn(
              "shrink-0 rounded-sm p-1.5 transition-colors",
              pinned ? "text-primary hover:bg-accent" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Pin className={cn("size-3.5", pinned && "fill-current")} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
