"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@cofounderai/core/ui/dialog";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { EmployeeOption } from "../../lib/employees/types";
import type { ScheduleEventItem } from "../../lib/events/types";

/** "Bulk 'Print Work Orders' for a day or for selected employees" (PRD §1.7) -- reuses
 * the same global `.print-area`/`.no-print` mechanism module-inventory's own barcode
 * label dialog already established (packages/core/src/ui-theme.css), so no new
 * dependency and no separate route. Scoped to whichever day/week is currently on
 * screen: `days`/`events` are exactly what the calendar board already loaded, so this
 * needs no extra round trip to the database. A work order is a `work`-kind event
 * (Kickserv's own literal meaning of the term) -- estimate/reminder events don't print
 * here. */
export function PrintWorkOrdersDialog({
  businessName,
  days,
  events,
  employees,
}: {
  businessName: string;
  days: string[];
  events: ScheduleEventItem[];
  employees: EmployeeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(days[0]);
  const [employeeIds, setEmployeeIds] = useState<Set<string>>(new Set());

  const employeeNameById = useMemo(() => new Map(employees.map((e) => [e.id, e.full_name || e.email || "Unnamed"])), [employees]);

  const workOrders = useMemo(() => {
    return events.filter((e) => {
      if (e.kind !== "work" || e.status === "cancelled") return false;
      if (e.starts_at.slice(0, 10) !== day) return false;
      if (employeeIds.size === 0) return true;
      return e.assignee_employee_ids.some((id) => employeeIds.has(id));
    });
  }, [events, day, employeeIds]);

  const toggleEmployee = (id: string) => {
    setEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Printer className="size-4" aria-hidden="true" />
        Print work orders
      </Button>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader className="no-print">
          <DialogTitle>Print work orders</DialogTitle>
        </DialogHeader>

        <div className="no-print grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Day</label>
            <NativeSelect value={day} onChange={(e) => setDay(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Employees (optional filter)</label>
            <div className="max-h-24 overflow-y-auto rounded-md border p-2">
              {employees.length === 0 ? (
                <p className="text-xs text-muted-foreground">No technicians yet.</p>
              ) : (
                employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <Checkbox checked={employeeIds.has(emp.id)} onCheckedChange={() => toggleEmployee(emp.id)} />
                    {emp.full_name || emp.email || "Unnamed"}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="no-print flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {workOrders.length} work order{workOrders.length === 1 ? "" : "s"} on {day}
          </p>
          <Button onClick={() => window.print()} disabled={workOrders.length === 0}>
            <Printer className="size-4" aria-hidden="true" />
            Print
          </Button>
        </div>

        <div className="print-area flex flex-col gap-4">
          <div>
            <p className="text-lg font-semibold">{businessName}</p>
            <p className="text-sm text-muted-foreground">Work orders -- {day}</p>
          </div>
          {workOrders.map((wo) => (
            <div key={wo.id} className="rounded-md border p-3" style={{ pageBreakInside: "avoid" }}>
              <p className="font-medium">
                {wo.subject_label} -- {wo.party_name}
              </p>
              <p className="text-sm text-muted-foreground">{formatDateTime(wo.starts_at)}</p>
              {wo.description ? <p className="mt-2 text-sm">{wo.description}</p> : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Assigned:{" "}
                {wo.assignee_employee_ids.length === 0
                  ? "Unassigned"
                  : wo.assignee_employee_ids.map((id) => employeeNameById.get(id) ?? "Unknown").join(", ")}
              </p>
            </div>
          ))}
          {workOrders.length === 0 ? <p className="text-sm text-muted-foreground">No work orders match.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
