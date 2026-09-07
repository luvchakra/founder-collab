"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronsUpDown, CreditCard, LogOut, Settings, ShieldCheck, SunMoon, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { SubmitButton } from "../ui/submit-button";
import { useDismiss } from "../../hooks/use-dismiss";
import type { ShellUser } from "./types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Account switcher pinned to the very bottom of the drawer -- ported from co-founder-ai's
 * components/tenancy/sidebar-account-menu.tsx (docs/PORT-PROVENANCE.md). The menu opens
 * upward above its own trigger row since there's no room below it. Links go to the
 * platform's own already-ported settings routes (apps/web/app/(dashboard)/dashboard/
 * settings/*), not co-founder-ai's.
 */
export function SidebarAccountMenu({
  user,
  onSignOut,
  onNavigate,
}: {
  user: ShellUser;
  onSignOut?: () => void;
  /** Also closes the drawer itself when a menu item navigates. */
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useDismiss(containerRef, open, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative border-t border-sidebar-border">
      {open ? (
        <div
          role="menu"
          className="absolute inset-x-0 bottom-full mb-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>

          <div className="my-1 border-t" />

          <Link
            href="/dashboard/settings/profile"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <User className="size-4 text-muted-foreground" aria-hidden="true" />
            Profile
          </Link>

          <Link
            href="/dashboard/settings/usage"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <BarChart3 className="size-4 text-muted-foreground" aria-hidden="true" />
            Usage
          </Link>

          <Link
            href="/dashboard/settings/billing"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />
            Billing
          </Link>

          <Link
            href="/dashboard/settings/appearance"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <SunMoon className="size-4 text-muted-foreground" aria-hidden="true" />
            Appearance
          </Link>

          <Link
            href="/dashboard/settings/ai-provider"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
            Settings
          </Link>

          {user.isPlatformAdmin ? (
            <Link
              href="/dashboard/admin"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
              className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
            >
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
              Admin
            </Link>
          ) : null}

          <div className="my-1 border-t" />

          <form action={onSignOut ? async () => onSignOut() : undefined}>
            <SubmitButton
              variant="ghost"
              pendingText="Signing out..."
              className="w-full justify-start gap-2 px-3 font-normal"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Log Out
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent"
      >
        <Avatar className="size-7">
          <AvatarImage src={user.avatarUrl} alt="" />
          <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </div>
  );
}
