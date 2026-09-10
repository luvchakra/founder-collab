"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import { Ban, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@cofounderai/core/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import type { EmployeeOption } from "../../lib/employees/types";
import type { TechnicianRosterRow } from "../../lib/employees/types";
import type { EventKind, JobOption, OpportunityOption, ScheduleEventItem } from "../../lib/events/types";
import { CreateEventDialog, type CreateEventActionState } from "./create-event-dialog";
import { PrintWorkOrdersDialog } from "./print-work-orders-dialog";
import { TechnicianRosterPanel } from "./technician-roster-panel";

const KIND_VARIANT: Record<EventKind, "default" | "secondary" | "outline"> = {
  work: "default",
  estimate: "secondary",
  reminder: "outline",
};

const UNASSIGNED_KEY = "unassigned";

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** ISO timestamp -> the local `YYYY-MM-DDTHH:mm` shape a `datetime-local` input needs
 * for its `defaultValue`/`value` -- same conversion CreateEventDialog's own caller
 * (the schedule page) already does for a brand-new event's default start, just
 * starting from an existing event's stored ISO string instead of a plain day. */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Moves `startsAt` to `newDay` (keeping its own time-of-day) and shifts `endsAt` by the
 * same delta if set -- the one piece of date math "drag to reschedule" needs, done in
 * the browser's own local time so it matches whatever the create/edit dialogs' plain
 * `datetime-local` inputs already assume (no per-tenant timezone plumbing exists
 * anywhere in the platform yet -- documented as a known simplification, same class of
 * gap as the day-boundary calculation in the schedule page's own server component). */
function retimeToDay(startsAt: string, endsAt: string | null, newDay: string): { startsAt: string; endsAt: string | null } {
  const original = new Date(startsAt);
  const parts = newDay.split("-").map(Number);
  const updated = new Date(original);
  updated.setFullYear(parts[0] ?? original.getFullYear(), (parts[1] ?? original.getMonth() + 1) - 1, parts[2] ?? original.getDate());
  const newStartsAt = updated.toISOString();
  if (!endsAt) return { startsAt: newStartsAt, endsAt: null };
  const delta = updated.getTime() - original.getTime();
  return { startsAt: newStartsAt, endsAt: new Date(new Date(endsAt).getTime() + delta).toISOString() };
}

export function ScheduleCalendar({
  businessId,
  businessName,
  view,
  days,
  events,
  employees,
  jobs,
  opportunities,
  technicianRoster,
  canManage,
  canPrint,
  prevHref,
  nextHref,
  todayHref,
  dayViewHref,
  weekViewHref,
  createEventAction,
  rescheduleAction,
  reassignAction,
  updateDescriptionAction,
  cancelAction,
  deleteAction,
  setTechnicianStatusAction,
}: {
  businessId: string;
  businessName: string;
  view: "day" | "week";
  days: string[];
  events: ScheduleEventItem[];
  employees: EmployeeOption[];
  jobs: JobOption[];
  opportunities: OpportunityOption[];
  technicianRoster: TechnicianRosterRow[];
  canManage: boolean;
  canPrint: boolean;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  dayViewHref: string;
  weekViewHref: string;
  createEventAction: (prevState: CreateEventActionState, formData: FormData) => Promise<CreateEventActionState>;
  rescheduleAction: (eventId: string, startsAt: string, endsAt: string | null) => Promise<void>;
  reassignAction: (eventId: string, employeeIds: string[]) => Promise<void>;
  updateDescriptionAction: (eventId: string, description: string) => Promise<void>;
  cancelAction: (eventId: string) => Promise<void>;
  deleteAction: (eventId: string) => Promise<void>;
  setTechnicianStatusAction: (userId: string, isTechnician: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<ScheduleEventItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editStartsAt, setEditStartsAt] = useState("");
  const [editEndsAt, setEditEndsAt] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAssigneeIds, setEditAssigneeIds] = useState<Set<string>>(new Set());

  function startEditing(event: ScheduleEventItem) {
    setEditStartsAt(toDatetimeLocal(event.starts_at));
    setEditEndsAt(event.ends_at ? toDatetimeLocal(event.ends_at) : "");
    setEditDescription(event.description ?? "");
    setEditAssigneeIds(new Set(event.assignee_employee_ids));
    setEditing(true);
  }

  function saveEdits(event: ScheduleEventItem) {
    const startsAt = new Date(editStartsAt).toISOString();
    const endsAt = editEndsAt ? new Date(editEndsAt).toISOString() : null;
    const assigneeIds = [...editAssigneeIds];
    run(async () => {
      await rescheduleAction(event.id, startsAt, endsAt);
      if (editDescription !== (event.description ?? "")) {
        await updateDescriptionAction(event.id, editDescription);
      }
      const currentAssignees = new Set(event.assignee_employee_ids);
      const assigneesChanged =
        assigneeIds.length !== currentAssignees.size || assigneeIds.some((id) => !currentAssignees.has(id));
      if (assigneesChanged) {
        await reassignAction(event.id, assigneeIds);
      }
      setEditing(false);
      setSelected(null);
    });
  }

  const rows = useMemo(() => [{ key: UNASSIGNED_KEY, label: "Unassigned" }, ...employees.map((e) => ({ key: e.id, label: e.full_name || e.email || "Unnamed" }))], [employees]);

  /** Renders an event once per assignee row it belongs to, plus once under Unassigned
   * if it has none -- an event with two technicians genuinely shows up in both their
   * rows, matching how a shared calendar naturally works. */
  const cellEvents = useMemo(() => {
    const map = new Map<string, ScheduleEventItem[]>();
    const key = (day: string, rowKey: string) => `${day}|${rowKey}`;
    for (const e of events) {
      const day = e.starts_at.slice(0, 10);
      const rowKeys = e.assignee_employee_ids.length > 0 ? e.assignee_employee_ids : [UNASSIGNED_KEY];
      for (const rowKey of rowKeys) {
        const k = key(day, rowKey);
        const list = map.get(k) ?? [];
        list.push(e);
        map.set(k, list);
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [events]);

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

  const onDragStart = (e: DragEvent, event: ScheduleEventItem, sourceRowKey: string) => {
    e.dataTransfer.setData("application/x-event-id", event.id);
    e.dataTransfer.setData("application/x-source-row", sourceRowKey);
  };

  /** Drag = reschedule (always: the drop cell's day becomes the event's new day, same
   * time-of-day) + reassign (only when the drop lands on a DIFFERENT row than it was
   * dragged from -- dropping back on the same technician's row, just a different day,
   * leaves the full assignee set untouched instead of narrowing a multi-assigned event
   * down to one). Dropping on Unassigned always clears every assignee. Multi-technician
   * assignment itself is only created via the create/edit dialog's checkboxes, not by
   * drag -- keeps one drag gesture unambiguous. */
  const onDrop = (e: DragEvent, day: string, targetRowKey: string) => {
    e.preventDefault();
    if (!canManage) return;
    const eventId = e.dataTransfer.getData("application/x-event-id");
    const sourceRowKey = e.dataTransfer.getData("application/x-source-row");
    const original = events.find((ev) => ev.id === eventId);
    if (!original) return;

    const { startsAt, endsAt } = retimeToDay(original.starts_at, original.ends_at, day);
    run(async () => {
      await rescheduleAction(eventId, startsAt, endsAt);
      if (targetRowKey !== sourceRowKey) {
        const newAssignees = targetRowKey === UNASSIGNED_KEY ? [] : [targetRowKey];
        await reassignAction(eventId, newAssignees);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={prevHref}>&larr;</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={todayHref}>Today</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={nextHref}>&rarr;</a>
          </Button>
          <div className="ml-2 flex items-center gap-1 rounded-lg border border-border p-1">
            <Button asChild variant={view === "day" ? "secondary" : "ghost"} size="sm">
              <a href={dayViewHref}>Day</a>
            </Button>
            <Button asChild variant={view === "week" ? "secondary" : "ghost"} size="sm">
              <a href={weekViewHref}>Week</a>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canPrint ? <PrintWorkOrdersDialog businessName={businessName} days={days} events={events} employees={employees} /> : null}
          {canManage ? (
            <CreateEventDialog action={createEventAction} jobs={jobs} opportunities={opportunities} employees={employees} defaultStartsAt={`${days[0]}T09:00`} />
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <div className="grid" style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(180px, 1fr))` }}>
          <div className="border-b border-r border-border bg-muted/30 p-2 text-xs font-semibold text-muted-foreground uppercase">Technician</div>
          {days.map((d) => (
            <div key={d} className="border-b border-border bg-muted/30 p-2 text-xs font-semibold text-muted-foreground uppercase">
              {dayLabel(d)}
            </div>
          ))}

          {rows.map((row) => (
            <div key={row.key} className="contents">
              <div className="truncate border-r border-b border-border p-2 text-sm font-medium">{row.label}</div>
              {days.map((day) => (
                <div
                  key={`${row.key}-${day}`}
                  className="flex min-h-16 flex-col gap-1 border-b border-border p-1.5 last:border-r-0"
                  onDragOver={(e) => canManage && e.preventDefault()}
                  onDrop={(e) => onDrop(e, day, row.key)}
                >
                  {(cellEvents.get(`${day}|${row.key}`) ?? []).map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      draggable={canManage}
                      onDragStart={(e) => onDragStart(e, ev, row.key)}
                      onClick={() => setSelected(ev)}
                      disabled={pending}
                      className="rounded-md border border-border bg-card p-1.5 text-left text-xs transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-center gap-1">
                        <Badge variant={KIND_VARIANT[ev.kind]} className="px-1 py-0 text-[10px]">
                          {ev.kind}
                        </Badge>
                        {!ev.all_day ? <span className="text-muted-foreground">{timeLabel(ev.starts_at)}</span> : null}
                        {ev.status === "cancelled" ? (
                          <Badge variant="destructive" className="px-1 py-0 text-[10px]">
                            cancelled
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate font-medium">{ev.party_name}</p>
                      <p className="truncate text-muted-foreground">{ev.subject_label}</p>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {canManage ? <TechnicianRosterPanel roster={technicianRoster} toggleAction={setTechnicianStatusAction} /> : null}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setEditing(false);
          }
        }}
      >
        <DialogContent>
          {selected ? (
            editing ? (
              <>
                <DialogHeader>
                  <DialogTitle>Edit event</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="edit-event-starts">Starts</Label>
                      <Input
                        id="edit-event-starts"
                        type="datetime-local"
                        value={editStartsAt}
                        onChange={(e) => setEditStartsAt(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="edit-event-ends">Ends (optional)</Label>
                      <Input
                        id="edit-event-ends"
                        type="datetime-local"
                        value={editEndsAt}
                        onChange={(e) => setEditEndsAt(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-event-description">Description</Label>
                    <Textarea
                      id="edit-event-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Assign technicians</Label>
                    {employees.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No technicians available.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5 rounded-md border p-2">
                        {employees.map((emp) => (
                          <label key={emp.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={editAssigneeIds.has(emp.id)}
                              onCheckedChange={(checked) =>
                                setEditAssigneeIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(emp.id);
                                  else next.delete(emp.id);
                                  return next;
                                })
                              }
                            />
                            {emp.full_name || emp.email || "Unnamed"}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => saveEdits(selected)} disabled={pending || !editStartsAt}>
                    Save changes
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {selected.subject_label} -- {selected.party_name}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">When: </span>
                    {timeLabel(selected.starts_at)}
                    {selected.ends_at ? ` -- ${timeLabel(selected.ends_at)}` : ""} on {selected.starts_at.slice(0, 10)}
                  </p>
                  {selected.description ? <p className="text-muted-foreground">{selected.description}</p> : null}
                  <p>
                    <span className="text-muted-foreground">Status: </span>
                    {selected.status}
                  </p>
                </div>
                {canManage ? (
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending || selected.status === "cancelled"}
                      onClick={() => startEditing(selected)}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="outline" disabled={pending || selected.status === "cancelled"}>
                          <Ban className="size-4" aria-hidden="true" />
                          Cancel event
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel this event?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This marks the event cancelled. It stays on record but no longer counts as
                            scheduled work.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep event</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              run(async () => {
                                await cancelAction(selected.id);
                                setSelected(null);
                              })
                            }
                          >
                            Cancel event
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" disabled={pending}>
                          <Trash2 className="size-4" aria-hidden="true" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes the event from the schedule and cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep event</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              run(async () => {
                                await deleteAction(selected.id);
                                setSelected(null);
                              })
                            }
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DialogFooter>
                ) : null}
              </>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
