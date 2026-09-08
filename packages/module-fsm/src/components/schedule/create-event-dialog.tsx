"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@cofounderai/core/ui/dialog";
import type { EmployeeOption } from "../../lib/employees/types";
import type { EventKind, JobOption, OpportunityOption } from "../../lib/events/types";

export type CreateEventActionState = { error: string } | { success: true; id: string } | null;

const KIND_LABEL: Record<EventKind, string> = { work: "Work", estimate: "Estimate visit", reminder: "Reminder" };

/** One dialog for all three event kinds (PRD §1's own "one calendar table, three
 * kinds" model) rather than three separate dialogs -- which subject picker shows
 * (job/opportunity/either) follows Kickserv's own pairing exactly: work events dispatch
 * a job, estimate events are how an opportunity gets quoted in person, and reminders
 * (internal only here -- automatic customer reminders are F-9's job) can sit on either. */
export function CreateEventDialog({
  action,
  jobs,
  opportunities,
  employees,
  defaultStartsAt,
}: {
  action: (prevState: CreateEventActionState, formData: FormData) => Promise<CreateEventActionState>;
  jobs: JobOption[];
  opportunities: OpportunityOption[];
  employees: EmployeeOption[];
  defaultStartsAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EventKind>("work");
  const [reminderSubject, setReminderSubject] = useState<"job" | "opportunity">("job");
  const [allDay, setAllDay] = useState(false);
  const [state, formAction] = useActionState<CreateEventActionState, FormData>(action, null);

  useEffect(() => {
    if (state && "success" in state) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const subjectIsJob = kind === "work" || (kind === "reminder" && reminderSubject === "job");
  const subjectIsOpportunity = kind === "estimate" || (kind === "reminder" && reminderSubject === "opportunity");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          New event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New schedule event</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-kind">Type</Label>
            <NativeSelect id="event-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
              {Object.entries(KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>

          {kind === "reminder" ? (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Attach to</span>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={reminderSubject === "job"} onChange={() => setReminderSubject("job")} /> Job
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={reminderSubject === "opportunity"} onChange={() => setReminderSubject("opportunity")} /> Opportunity
              </label>
            </div>
          ) : null}

          {subjectIsJob ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-job">Job</Label>
              <NativeSelect id="event-job" name="job_id" required>
                <option value="">Select job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.number ? `${j.number} -- ` : ""}
                    {j.party_name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}

          {subjectIsOpportunity ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-opportunity">Opportunity</Label>
              <NativeSelect id="event-opportunity" name="opportunity_id" required>
                <option value="">Select opportunity</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number ? `${o.number} -- ` : ""}
                    {o.party_name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-starts">Starts</Label>
              <Input id="event-starts" name="starts_at" type="datetime-local" defaultValue={defaultStartsAt} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-ends">Ends (optional)</Label>
              <Input id="event-ends" name="ends_at" type="datetime-local" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="all_day" checked={allDay} onCheckedChange={(v) => setAllDay(v === true)} />
            All day
          </label>

          {kind === "work" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-arrival-start">Arrival window start</Label>
                <Input id="event-arrival-start" name="arrival_window_start" type="datetime-local" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-arrival-end">Arrival window end</Label>
                <Input id="event-arrival-end" name="arrival_window_end" type="datetime-local" />
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-description">Description</Label>
            <Textarea id="event-description" name="description" rows={2} placeholder="Notes for whoever's assigned" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Assign technicians</Label>
            {employees.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No technicians yet -- add one from the roster panel below, or leave this unassigned.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5 rounded-md border p-2">
                {employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2 text-sm">
                    <Checkbox name="employee_ids" value={emp.id} />
                    {emp.full_name || emp.email || "Unnamed"}
                  </label>
                ))}
              </div>
            )}
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingText="Creating...">Create event</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
