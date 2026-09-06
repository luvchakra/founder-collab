"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useDismiss } from "../../hooks/use-dismiss";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { ShellAlert } from "./types";

const READ_IDS_STORAGE_KEY = "cofounder-ai:read-alert-ids";

function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(READ_IDS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(READ_IDS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Best-effort: a full or unavailable localStorage just means read state doesn't
    // persist across reloads, not a broken feature.
  }
}

/**
 * Bell icon in the topbar -- alerts are computed server-side by the caller (e.g.
 * apps/web's dashboard layout, via module-discovery's deriveAccountAlerts) from data
 * already fetched for that render, so this component is purely presentational: a
 * dropdown over whatever list it's handed.
 *
 * Read/unread has no server-side model (alerts are derived on every render, not rows in a
 * table), so it's tracked here in localStorage keyed by each alert's stable id. Clicking a
 * notification marks it read: its dot switches from filled to an unchecked outline and it
 * stops counting toward the bell's badge.
 */
export function AlertBell({ alerts }: { alerts: ShellAlert[] }) {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  useDismiss(containerRef, open, () => setOpen(false));

  useEffect(() => {
    // Reading localStorage (an external system unavailable during SSR) is exactly what
    // this effect exists to synchronize -- there's no render-time alternative.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadIds(loadReadIds());
  }, []);

  function markRead(id: string) {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      saveReadIds(next);
      return next;
    });
  }

  const unreadCount = alerts.filter((a) => !readIds.has(a.id)).length;
  const hasUnreadWarning = alerts.some((a) => a.severity === "warning" && !readIds.has(a.id));

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `${unreadCount} unread alerts` : "Alerts"}
        aria-expanded={open}
        className="relative shrink-0"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            className={cn(
              "absolute top-1 right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-medium text-primary-foreground",
              hasUnreadWarning ? "bg-destructive" : "bg-primary",
            )}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label="Alerts"
          className="absolute top-full right-0 z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {alerts.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            alerts.map((alert) => {
              const isRead = readIds.has(alert.id);
              return (
                <Link
                  key={alert.id}
                  href={alert.href}
                  role="menuitem"
                  onClick={() => {
                    markRead(alert.id);
                    setOpen(false);
                  }}
                  className="flex items-start gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      isRead
                        ? "border border-muted-foreground/50 bg-transparent"
                        : alert.severity === "warning"
                          ? "bg-destructive"
                          : "bg-primary",
                    )}
                    aria-hidden="true"
                  />
                  <span className={isRead ? "text-muted-foreground" : undefined}>
                    {alert.message}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
