"use client";

import { useState } from "react";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { formatDate } from "@cofounderai/core/lib/format";
import type { OpportunityListItem, OpportunityStatus } from "../../lib/opportunities/types";
import { CreateOpportunityDialog, type CreateOpportunityActionState } from "./create-opportunity-dialog";
import type { CustomerOption } from "../../lib/opportunities/types";
import type { ServiceTypeOption } from "../../lib/service-types/types";

const COLUMNS: { status: OpportunityStatus; label: string }[] = [
  { status: "new", label: "New" },
  { status: "estimate_scheduled", label: "Estimate Scheduled" },
  { status: "estimate_sent", label: "Estimate Sent" },
  { status: "won", label: "Won" },
  { status: "lost", label: "Lost" },
];

const STATUS_VARIANT: Record<OpportunityStatus, "default" | "secondary" | "destructive"> = {
  new: "secondary",
  estimate_scheduled: "secondary",
  estimate_sent: "default",
  won: "default",
  lost: "destructive",
};

/** Board columns are read-only here (PRD's own drag interaction is specific to
 * Scheduling, F-6, not the opportunities pipeline) -- a status advances only through an
 * opportunity's own explicit actions (schedule/send an estimate, mark lost), not by
 * dragging a card between columns. */
export function OpportunitiesList({
  opportunities,
  customers,
  serviceTypes,
  createAction,
}: {
  opportunities: OpportunityListItem[];
  customers: CustomerOption[];
  serviceTypes: ServiceTypeOption[];
  createAction: (prevState: CreateOpportunityActionState, formData: FormData) => Promise<CreateOpportunityActionState>;
}) {
  const [view, setView] = useState<"board" | "table">("board");
  const opportunityHref = (o: OpportunityListItem) => `/dashboard/businesses/${o.business_id}/fsm/opportunities/${o.id}`;

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
        <CreateOpportunityDialog action={createAction} customers={customers} serviceTypes={serviceTypes} />
      </div>

      {opportunities.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          No opportunities yet.
        </p>
      ) : view === "board" ? (
        <div className="grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = opportunities.filter((o) => o.status === col.status);
            return (
              <div key={col.status} className="flex min-w-[220px] flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {col.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((o) => (
                    <a
                      key={o.id}
                      href={opportunityHref(o)}
                      className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
                    >
                      <p className="font-medium">{o.party_name}</p>
                      {o.service_type_name ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{o.service_type_name}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(o.created_at)}</p>
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
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.map((o) => (
                <TableRow key={o.id} className="cursor-pointer">
                  <TableCell>
                    <a href={opportunityHref(o)} className="hover:underline">
                      {o.party_name}
                    </a>
                  </TableCell>
                  <TableCell>{o.service_type_name ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[o.status]}>
                      {COLUMNS.find((c) => c.status === o.status)?.label ?? o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
