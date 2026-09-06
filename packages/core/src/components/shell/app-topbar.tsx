"use client";

import type { ReactNode } from "react";
import { LogOut, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { AlertBell } from "./alert-bell";
import type { ShellAlert, ShellUser } from "./types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Top bar — visual chrome per docs/DESIGN.md's reference mockup. `onSignOut` is
 * optional so this still renders (menu just has nothing to do) before a caller wires a
 * real sign-out action. `alerts` defaults to empty so this still renders before a
 * caller wires up real alert derivation. `chatSlot` is a generic escape hatch for a
 * module-owned widget (e.g. module-discovery's AiChatWidget) that core itself can never
 * import directly — modules depend on core, not the reverse. */
export function AppTopbar({
  user,
  alerts,
  chatSlot,
  onSignOut,
}: {
  user: ShellUser;
  alerts?: ShellAlert[];
  chatSlot?: ReactNode;
  onSignOut?: () => void;
}) {
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-6">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search anything..." className="pl-9" />
      </div>
      <div className="flex items-center gap-4">
        <AlertBell alerts={alerts ?? []} />
        {chatSlot}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-accent"
            >
              <Avatar>
                <AvatarImage src={user.avatarUrl} alt="" />
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="hidden flex-col items-start leading-tight sm:flex">
                <span className="text-sm font-medium text-foreground">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
