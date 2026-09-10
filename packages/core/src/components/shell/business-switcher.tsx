"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Pin, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import type { ShellBusiness } from "./types";

/** Same `localStorage`-key convention as the sidebar's own pinned-module feature
 * (app-sidebar.tsx's `PINNED_MODULE_STORAGE_KEY`) -- there is no per-user preferences
 * table in `core` to extend, so client-only storage is the established pattern here, not
 * a gap specific to this feature. Unlike pinning a module (an exclusive lock -- only one
 * module can be pinned, and it disables switching away from it), pinning a business is a
 * plain favorites list: any number of businesses can be pinned, pinning never blocks
 * switching to an unpinned one, it just sorts pinned businesses to the top of this list. */
const PINNED_BUSINESSES_STORAGE_KEY = "cofounderai:pinned-businesses";

function readPinnedBusinessIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PINNED_BUSINESSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writePinnedBusinessIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PINNED_BUSINESSES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private browsing, quota) -- pins just won't persist.
  }
}

/**
 * Topbar business switcher -- ported from co-founder-ai's header BusinessSelector
 * (components/tenancy/business-selector.tsx, per its "Header & Business Selector
 * Enhancement" doc: always reachable from anywhere in the dashboard, not just pages with
 * a business in the URL, and "+ Create New Business" always last, separated by a
 * divider). Rebuilt on the shell's own DropdownMenu primitives (the same ones AppTopbar's
 * avatar menu already uses) rather than co-founder-ai's hand-rolled popover, so it picks
 * up the platform's own light/blue design system per docs/DESIGN.md instead of
 * co-founder-ai's dark-violet one (CLAUDE.md non-negotiable #7). The sidebar keeps its
 * own business list (drill-down into products); this is the quick "which business am I
 * in" control that stays visible from the topbar.
 */
export function BusinessSwitcher({
  businesses,
  activeBusinessId,
  businessHref,
  onCreateBusiness,
}: {
  businesses: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref: (businessId: string) => string;
  onCreateBusiness?: () => void;
}) {
  const activeBusiness = businesses.find((b) => b.id === activeBusinessId) ?? null;
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    setPinnedIds(readPinnedBusinessIds());
  }, []);

  function togglePin(businessId: string) {
    setPinnedIds((prev) => {
      const next = prev.includes(businessId) ? prev.filter((id) => id !== businessId) : [...prev, businessId];
      writePinnedBusinessIds(next);
      return next;
    });
  }

  // Pinned businesses float to the top (stable within each group -- neither group is
  // re-sorted beyond that) rather than an exclusive lock like the sidebar's module pin:
  // any number of businesses can be pinned, and pinning one never blocks switching to an
  // unpinned one.
  const orderedBusinesses = [...businesses].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id);
    const bPinned = pinnedIds.includes(b.id);
    return aPinned === bPinned ? 0 : aPinned ? -1 : 1;
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <span className="truncate">{activeBusiness?.name ?? "Select Business"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {businesses.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No businesses yet.</p>
        ) : (
          orderedBusinesses.map((business) => {
            const isPinned = pinnedIds.includes(business.id);
            return (
              <DropdownMenuItem key={business.id} asChild>
                <Link
                  href={businessHref(business.id)}
                  className={cn(
                    "flex items-center justify-between gap-2",
                    business.id === activeBusinessId && "font-medium",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {business.name}
                    {business.description ? (
                      <span className="text-muted-foreground"> - {business.description}</span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {business.id === activeBusinessId ? (
                      <Check className="size-4 text-primary" aria-hidden="true" />
                    ) : null}
                    <button
                      type="button"
                      aria-label={isPinned ? `Unpin ${business.name}` : `Pin ${business.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePin(business.id);
                      }}
                      className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pin className={cn("size-3.5", isPinned && "fill-current text-primary")} aria-hidden="true" />
                    </button>
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreateBusiness} className="text-primary">
          <Plus className="size-4" aria-hidden="true" />
          Create New Business
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
