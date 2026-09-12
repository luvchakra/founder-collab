import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { isFilingOverdue } from "../../lib/calendar/overdue";
import type { FilingObligation } from "../../lib/calendar/types";

/** COMPLY-P0-11.5 (Clear Status Hierarchy): icon + text + color together, same
 * discipline as `SeverityBadge` -- filed (done, green check), overdue (red triangle),
 * everything else shown by its own real lifecycle stage name rather than a vague "on
 * track" (a period sitting in "draft" two weeks before its due date is a different real
 * state from one already "in_review", and this shows which). */
function FilingStatusBadge({ obligation, asOf }: { obligation: FilingObligation; asOf: string }) {
  if (obligation.status === "filed") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/15 text-success-foreground">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Filed
      </Badge>
    );
  }
  const overdue = isFilingOverdue(obligation, asOf);
  if (overdue.status === "overdue") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" aria-hidden="true" />
        Overdue {overdue.daysOverdue}d
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <CalendarClock className="size-3" aria-hidden="true" />
      {obligation.status ? obligation.status.replace("_", " ") : "Not started"}
    </Badge>
  );
}

export function UpcomingFilingsList({ businessId, obligations, asOf }: { businessId: string; obligations: FilingObligation[]; asOf: string }) {
  const filingHref = `/dashboard/businesses/${businessId}/gst/filing`;

  if (obligations.length === 0) {
    return <EmptyState icon={CalendarClock} message="No India/GST registration on file yet -- add one under GST Registrations to see your filing calendar." />;
  }

  return (
    <div className="rounded-2xl border border-border">
      <ul className="divide-y md:hidden">
        {obligations.map((obligation) => (
          <li key={`${obligation.returnType}-${obligation.periodStart}`} className="flex flex-col gap-2 p-3 text-sm">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <span className="font-medium">{obligation.returnType.toUpperCase()}</span>
              <FilingStatusBadge obligation={obligation} asOf={asOf} />
            </div>
            <p className="text-xs text-muted-foreground">
              {obligation.periodStart} to {obligation.periodEnd} -- due {obligation.dueDate}
            </p>
            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm">
                <Link href={`${filingHref}?period=${obligation.periodStart.slice(0, 7)}`}>Review</Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Return</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {obligations.map((obligation) => (
            <TableRow key={`${obligation.returnType}-${obligation.periodStart}`}>
              <TableCell className="font-medium whitespace-nowrap">{obligation.returnType.toUpperCase()}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {obligation.periodStart} to {obligation.periodEnd}
              </TableCell>
              <TableCell className="whitespace-nowrap">{obligation.dueDate}</TableCell>
              <TableCell>
                <FilingStatusBadge obligation={obligation} asOf={asOf} />
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link href={`${filingHref}?period=${obligation.periodStart.slice(0, 7)}`}>Review</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
