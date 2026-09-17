"use client";

import type { ReactNode } from "react";
import { AlertBell } from "./alert-bell";
import { BusinessSwitcher } from "./business-switcher";
import { SidebarToggle } from "./sidebar-toggle";
import type { ShellAlert, ShellBusiness } from "./types";

/**
 * The bar above the content column, to the right of the rail (docs/DESIGN.md). Module
 * navigation and the account menu live in the rail; what sits here is the one control
 * that answers "which business am I in" -- the switcher, left, where it reads first --
 * with the notification/assistant cluster opposite it. The mobile drawer toggle joins it
 * on the left below `lg`, where the rail isn't on screen.
 *
 * No wordmark: the rail carries the brand on desktop, and repeating it here only
 * competes with the switcher for the same corner.
 *
 * `chatSlot` is a generic escape hatch for a module-owned widget (e.g.
 * module-discovery's AiChatWidget) that core itself can never import directly -- modules
 * depend on core, not the reverse.
 *
 * No global search input: the design reference shows one, but what it should actually
 * search spans every module's own RLS-scoped, license-gated entities and no story has
 * specced it yet -- see docs/DESIGN.md, which records leaving `command.tsx` vendored and
 * unused rather than shipping a box that looks real and does nothing.
 */
export function AppTopbar({
  businesses,
  activeBusinessId,
  businessHref,
  onCreateBusiness,
  alerts,
  chatSlot,
}: {
  businesses?: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref?: (businessId: string) => string;
  onCreateBusiness?: () => void;
  alerts?: ShellAlert[];
  chatSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-4 sm:gap-3 sm:px-6 print:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="lg:hidden">
          <SidebarToggle />
        </div>
        {businesses ? (
          <BusinessSwitcher
            businesses={businesses}
            activeBusinessId={activeBusinessId}
            businessHref={businessHref ?? (() => "#")}
            onCreateBusiness={onCreateBusiness}
          />
        ) : null}
      </div>
      <AlertBell alerts={alerts ?? []} activeBusinessId={activeBusinessId} />
      {chatSlot}
    </header>
  );
}
