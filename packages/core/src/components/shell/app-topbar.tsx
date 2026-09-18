"use client";

import { Suspense, use } from "react";
import type { ReactNode } from "react";
import { isPromiseLike } from "../../lib/promise-like";
import { AlertBell } from "./alert-bell";
import { BusinessSwitcher } from "./business-switcher";
import { SidebarToggle } from "./sidebar-toggle";
import type { ShellAlert, ShellBusiness } from "./types";

/** The bell once its alerts have arrived. Suspends (showing an empty bell as
 * the fallback) only while a promise is still pending; a plain array renders at once. */
function StreamedAlertBell({
  alerts,
  activeBusinessId,
}: {
  alerts: ShellAlert[] | Promise<ShellAlert[]> | undefined;
  activeBusinessId?: string | null;
}) {
  const resolved = isPromiseLike(alerts) ? use(alerts) : (alerts ?? []);
  return <AlertBell alerts={resolved} activeBusinessId={activeBusinessId} />;
}

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
  /** Either the alerts themselves or a promise of them. The dashboard layout streams
   * them: gathering every licensed module's dashboard summary is the slowest thing the
   * shell does, and nothing else in the bar depends on it. */
  alerts?: ShellAlert[] | Promise<ShellAlert[]>;
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
      <Suspense fallback={<AlertBell alerts={[]} activeBusinessId={activeBusinessId} />}>
        <StreamedAlertBell alerts={alerts} activeBusinessId={activeBusinessId} />
      </Suspense>
      {chatSlot}
    </header>
  );
}
