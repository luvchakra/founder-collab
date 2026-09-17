"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BRAND_NAME } from "../../lib/brand";
import { AlertBell } from "./alert-bell";
import { LogoMark } from "./logo-mark";
import { SidebarToggle } from "./sidebar-toggle";
import type { ShellAlert } from "./types";

/**
 * The bar above the content column, to the right of the rail (docs/DESIGN.md). It is
 * deliberately thin: navigation, the business switcher and the account menu all live in
 * the rail, so what's left here is the mobile drawer toggle (the rail is persistent from
 * `lg` up, so the toggle and the wordmark beside it are mobile-only) and the
 * notification/assistant cluster on the right.
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
  alerts,
  activeBusinessId,
  chatSlot,
}: {
  alerts?: ShellAlert[];
  activeBusinessId?: string | null;
  chatSlot?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-4 sm:px-6 print:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
        <SidebarToggle />
        <Link
          href="/dashboard"
          aria-label={BRAND_NAME}
          className="flex shrink-0 items-center transition-transform duration-100 active:scale-95"
        >
          <LogoMark className="h-7 w-auto" />
        </Link>
      </div>
      <div className="hidden flex-1 lg:block" />
      <AlertBell alerts={alerts ?? []} activeBusinessId={activeBusinessId} />
      {chatSlot}
    </header>
  );
}
