"use client";

import { useState, useTransition } from "react";
import { Navigation } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import type { OpenTimeEntry } from "../../lib/time-entries/types";
import type { EventKind, ScheduleEventItem } from "../../lib/events/types";

const KIND_LABEL: Record<EventKind, string> = { work: "Work", estimate: "Estimate", reminder: "Reminder" };

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** "Home screen is today's schedule ... swipe to Notify ... tap the map for GPS
 * routing ... Clock In" (PRD §1.8) -- a single scrollable list, not a calendar grid,
 * matches "mobile-first" better than reusing the desktop board. "Swipe" becomes a plain
 * button (no gesture library, CLAUDE.md principle 2); "tap the map" becomes a link to
 * the device's own default maps app via a `geo:`/search-style URL -- no map SDK, no new
 * dependency, and it still gets the technician real turn-by-turn via whatever app they
 * already have. */
export function MyDayList({
  events,
  openTimeEntry,
  canManageEvents,
  canClockInOut,
  jobsBasePath,
  opportunitiesBasePath,
  notifyOnTheWayAction,
  markArrivedAction,
  markDoneAction,
  clockInAction,
  clockOutAction,
}: {
  events: ScheduleEventItem[];
  openTimeEntry: OpenTimeEntry | null;
  canManageEvents: boolean;
  canClockInOut: boolean;
  /** Plain base paths, not `(id) => string` closures -- only a real `"use server"`
   * action (or a `.bind()` of one) may cross the Server-to-Client Component boundary; an
   * ordinary function like a URL builder throws at runtime the moment this component
   * actually renders, even though it type-checks fine (confirmed via Vercel's own runtime
   * error logs for this exact page: "Functions cannot be passed directly to Client
   * Components..."). The href is built inline below from plain string data instead. */
  jobsBasePath: string;
  opportunitiesBasePath: string;
  notifyOnTheWayAction: (eventId: string) => Promise<void>;
  markArrivedAction: (eventId: string) => Promise<void>;
  markDoneAction: (eventId: string) => Promise<void>;
  clockInAction: (jobId: string) => Promise<void>;
  clockOutAction: (jobId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  if (events.length === 0) {
    return <EmptyState variant="inline" message="Nothing on your schedule today." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {events.map((event) => {
        const isClockedInHere = event.job_id !== null && openTimeEntry?.job_id === event.job_id;
        const isClockedInElsewhere = openTimeEntry !== null && openTimeEntry.job_id !== event.job_id;
        return (
          <div key={event.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Badge variant={event.kind === "work" ? "default" : event.kind === "estimate" ? "secondary" : "outline"}>{KIND_LABEL[event.kind]}</Badge>
              <span className="text-sm font-medium">{timeLabel(event.starts_at)}</span>
              {event.status === "cancelled" ? <Badge variant="destructive">Cancelled</Badge> : null}
            </div>
            <p className="mt-1 font-medium">{event.party_name}</p>
            <p className="text-sm text-muted-foreground">{event.subject_label}</p>
            {event.description ? <p className="mt-1 text-sm text-muted-foreground">{event.description}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={event.job_id ? `${jobsBasePath}/${event.job_id}` : `${opportunitiesBasePath}/${event.opportunity_id}`}>Open</a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a href={`https://maps.google.com/?q=${encodeURIComponent(event.party_name)}`} target="_blank" rel="noreferrer">
                  <Navigation className="size-4" aria-hidden="true" />
                  Map
                </a>
              </Button>

              {canManageEvents && event.kind === "work" && event.status === "scheduled" ? (
                <Button size="sm" disabled={pending} onClick={() => run(() => notifyOnTheWayAction(event.id))}>
                  Notify: on the way
                </Button>
              ) : null}
              {canManageEvents && event.status === "en_route" ? (
                <Button size="sm" disabled={pending} onClick={() => run(() => markArrivedAction(event.id))}>
                  Mark arrived
                </Button>
              ) : null}
              {canManageEvents && event.status === "arrived" ? (
                <Button size="sm" disabled={pending} onClick={() => run(() => markDoneAction(event.id))}>
                  Mark done
                </Button>
              ) : null}

              {canClockInOut && event.job_id ? (
                isClockedInHere ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => clockOutAction(event.job_id!))}>
                    Clock out
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={pending || isClockedInElsewhere} onClick={() => run(() => clockInAction(event.job_id!))}>
                    Clock in
                  </Button>
                )
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
