"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertBell } from "./alert-bell";
import { BusinessSwitcher } from "./business-switcher";
import { LogoMark } from "./logo-mark";
import { SidebarToggle } from "./sidebar-toggle";
import type { ShellAlert, ShellBusiness } from "./types";

/**
 * Top bar -- ported structurally from co-founder-ai's app/(dashboard)/layout.tsx header
 * (docs/PORT-PROVENANCE.md): hamburger toggle + logo + business switcher on the left,
 * alert bell + chat slot on the right. The account/avatar menu lives at the bottom of the
 * drawer (app-sidebar.tsx), not here -- matching co-founder-ai's own layout, where the
 * topbar never carries an avatar. `chatSlot` is a generic escape hatch for a
 * module-owned widget (e.g. module-discovery's AiChatWidget) that core itself can never
 * import directly -- modules depend on core, not the reverse.
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
    <header className="relative z-50 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 sm:gap-4 sm:px-6 print:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarToggle />
        <Link
          href="/dashboard"
          aria-label="CoFounderAI"
          className="flex shrink-0 items-center transition-transform duration-100 active:scale-95"
        >
          <LogoMark className="h-8 w-auto" />
        </Link>
        {businesses ? (
          <BusinessSwitcher
            businesses={businesses}
            activeBusinessId={activeBusinessId}
            businessHref={businessHref ?? (() => "#")}
            onCreateBusiness={onCreateBusiness}
          />
        ) : null}
      </div>
      <AlertBell alerts={alerts ?? []} />
      {chatSlot}
    </header>
  );
}
