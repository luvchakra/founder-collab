"use client";

import { useState } from "react";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { formatDate } from "@cofounderai/core/lib/format";
import type { CustomerOption } from "../../lib/opportunities/types";
import type { ServiceTypeOption } from "../../lib/service-types/types";
import type { JobListItem, JobStatus } from "../../lib/jobs/types";
import { CreateJobDialog, type CreateJobActionState } from "./create-job-dialog";

const COLUMNS: { status: JobStatus; label: string }[] = [
  { status: "unscheduled", label: "Unscheduled" },
  { status: "scheduled", label: "Scheduled" },
  { status: "in_progress", label: "In Progress" },
  { status: "on_hold", label: "On Hold" },
  { status: "completed", label: "Completed" },
];

const STATUS_VARIANT: Record<JobStatus, "default" | "secondary" | "destructive" | "outline"> = {
  unscheduled: "secondary",
  scheduled: "secondary",
  in_progress: "default",
  on_hold: "outline",
  completed: "default",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Board columns are read-only, same as OpportunitiesList -- a job's status advances
 * through its own explicit actions (start/hold/resume/complete/cancel), not by dragging a
 * card. Cancelled jobs don't get their own board column (PRD §1.3's board is
 * Unscheduled→Completed) but still show in the table view. */
export function JobsList({
  jobs,
  customers,
  serviceTypes,
  createAction,
}: {
  jobs: JobListItem[];
  customers: CustomerOption[];
  serviceTypes: ServiceTypeOption[];
  createAction: (prevState: CreateJobActionState, formData: FormData) => Promise<CreateJobActionState>;
}) {
  const [view, setView] = useState<"board" | "table">("board");
  const jobHref = (j: JobListItem) => `/dashboard/businesses/${j.business_id}/fsm/jobs/${j.id}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          <Button variant={view === "board" ? "secondary" : "ghost"} size="sm" onClick={() => setView("board")}>
            <LayoutGrid className="size-4" aria-hidden="true" />
            Board
          </Button>
          <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" onClick={() => setView("table")}>
            <ListIcon className="size-4" aria-hidden="true" />
            Table
          </Button>
        </div>
        <CreateJobDialog action={createAction} customers={customers} serviceTypes={serviceTypes} />
      </div>

      {jobs.length === 0 ? (
        <EmptyState variant="inline" message="No jobs yet." />
      ) : view === "board" ? (
        <div className="grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = jobs.filter((j) => j.status === col.status);
            return (
              <div key={col.status} className="flex min-w-[220px] flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{col.label}</span>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((j) => (
                    <a key={j.id} href={jobHref(j)} className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
                      <p className="font-medium">{j.party_name}</p>
                      {j.service_type_name ? <p className="mt-0.5 text-xs text-muted-foreground">{j.service_type_name}</p> : null}
                      {j.number ? <p className="mt-1 text-xs text-muted-foreground">{j.number}</p> : null}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id} className="cursor-pointer">
                  <TableCell>
                    <a href={jobHref(j)} className="hover:underline">
                      {j.number ?? "-"}
                    </a>
                  </TableCell>
                  <TableCell>{j.party_name}</TableCell>
                  <TableCell>{j.service_type_name ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[j.status]}>{STATUS_LABEL[j.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(j.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
