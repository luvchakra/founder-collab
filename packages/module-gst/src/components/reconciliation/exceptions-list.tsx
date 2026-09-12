import { CheckCircle2, ListChecks, XCircle } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { ExceptionStatus, ExceptionType, ReconciliationException } from "../../lib/exceptions/types";

const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  supplier_mismatch: "Supplier mismatch",
  missing_in_2b: "Missing in GSTR-2B",
  missing_in_books: "Missing in books",
  ims_pending: "IMS pending",
};

/** COMPLY-P0-11.5: icon + text + color, never color alone -- same discipline as the
 * dashboard's own `SeverityBadge`/`FilingStatusBadge`. */
function StatusBadge({ status }: { status: ExceptionStatus }) {
  if (status === "resolved") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/15 text-success-foreground">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Resolved
      </Badge>
    );
  }
  if (status === "dismissed") {
    return (
      <Badge variant="secondary" className="gap-1">
        <XCircle className="size-3" aria-hidden="true" />
        Dismissed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-warning/30 bg-warning/15 text-warning-foreground">
      <ListChecks className="size-3" aria-hidden="true" />
      Open
    </Badge>
  );
}

/** COMPLY-P0-11.4 (Row-Level Actions): `[Resolve] [Dismiss]` for an open exception --
 * exactly the backlog's own worked example shape -- nothing for an already-decided one
 * (this module's own terminal-once-decided lifecycle rule: neither mutation is legal
 * past `"open"`, so no action button would ever succeed anyway). */
function RowActions({
  exception,
  resolveAction,
  dismissAction,
}: {
  exception: ReconciliationException;
  resolveAction: (exceptionId: string) => Promise<void>;
  dismissAction: (exceptionId: string) => Promise<void>;
}) {
  if (exception.status !== "open") return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex justify-end gap-2">
      <form action={resolveAction.bind(null, exception.id)}>
        <SubmitButton variant="outline" size="sm">
          Resolve
        </SubmitButton>
      </form>
      <form action={dismissAction.bind(null, exception.id)}>
        <SubmitButton variant="ghost" size="sm">
          Dismiss
        </SubmitButton>
      </form>
    </div>
  );
}

export function ExceptionsList({
  exceptions,
  resolveAction,
  dismissAction,
}: {
  exceptions: ReconciliationException[];
  resolveAction: (exceptionId: string) => Promise<void>;
  dismissAction: (exceptionId: string) => Promise<void>;
}) {
  if (exceptions.length === 0) {
    return <EmptyState icon={ListChecks} message="No reconciliation exceptions for this period -- everything matched, or none have been synced yet." />;
  }

  return (
    <div className="rounded-2xl border border-border">
      <ul className="divide-y md:hidden">
        {exceptions.map((exception) => (
          <li key={exception.id} className="flex flex-col gap-2 p-3 text-sm">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <span className="min-w-0 break-words font-medium">{EXCEPTION_TYPE_LABEL[exception.exceptionType]}</span>
              <StatusBadge status={exception.status} />
            </div>
            <p className="text-xs text-muted-foreground">{exception.summary}</p>
            <RowActions exception={exception} resolveAction={resolveAction} dismissAction={dismissAction} />
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {exceptions.map((exception) => (
            <TableRow key={exception.id}>
              <TableCell className="font-medium whitespace-nowrap">{EXCEPTION_TYPE_LABEL[exception.exceptionType]}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{exception.summary}</TableCell>
              <TableCell>
                <StatusBadge status={exception.status} />
              </TableCell>
              <TableCell className="text-right">
                <RowActions exception={exception} resolveAction={resolveAction} dismissAction={dismissAction} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
