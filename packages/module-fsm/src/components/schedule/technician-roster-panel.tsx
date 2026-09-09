"use client";

import { useTransition } from "react";
import { Switch } from "@cofounderai/core/ui/switch";
import { toast } from "@cofounderai/core/ui/sonner";
import type { TechnicianRosterRow } from "../../lib/employees/types";

/** No "Manage Users"/employee-CRUD screen exists anywhere in the platform yet -- this is
 * the minimal roster this story needs to make "assign to a technician" usable at all: a
 * business member either counts as a technician (has an active `core.employees` row)
 * or doesn't. A fuller employee record (job title, employment type, time-off) stays a
 * future story's job. */
export function TechnicianRosterPanel({
  roster,
  toggleAction,
}: {
  roster: TechnicianRosterRow[];
  toggleAction: (userId: string, isTechnician: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  if (roster.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase">Technicians</h2>
      <p className="mt-1 text-xs text-muted-foreground">Who can be assigned schedule events.</p>
      <div className="mt-3 flex flex-col gap-2">
        {roster.map((m) => (
          <label key={m.user_id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {m.full_name || m.email || m.user_id}
              <span className="ml-2 text-xs text-muted-foreground">{m.role}</span>
            </span>
            <Switch
              checked={m.is_active}
              disabled={pending}
              onCheckedChange={(checked) =>
                startTransition(async () => {
                  try {
                    await toggleAction(m.user_id, checked);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not update technician status.");
                  }
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}
