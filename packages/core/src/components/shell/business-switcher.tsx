"use client";

import Link from "next/link";
import { Check, ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import type { ShellBusiness } from "./types";

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex max-w-56 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <span className="truncate">{activeBusiness?.name ?? "Select business"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Businesses</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {businesses.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No businesses yet.</p>
        ) : (
          businesses.map((business) => (
            <DropdownMenuItem key={business.id} asChild>
              <Link
                href={businessHref(business.id)}
                className={cn(
                  "flex items-center justify-between gap-2",
                  business.id === activeBusinessId && "font-medium",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{business.name}</span>
                {business.id === activeBusinessId ? (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))
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
