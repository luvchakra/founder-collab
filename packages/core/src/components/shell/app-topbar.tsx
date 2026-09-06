"use client";

import { Bell, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
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

/** Top bar — visual chrome per docs/DESIGN.md's reference mockup. `user` is a
 * placeholder until Epic 2 wires real session data. */
export function AppTopbar({ user }: { user: ShellUser }) {
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-6">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search anything..." className="pl-9" />
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-5" />
        </Button>
        <div className="flex items-center gap-2.5">
          <Avatar>
            <AvatarImage src={user.avatarUrl} alt="" />
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-medium text-foreground">{user.name}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
