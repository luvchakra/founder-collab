import { CheckCircle2, CircleDot, ListChecks, Search, XCircle } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { FinanceException, FinanceExceptionStatus, FinanceExceptionType } from "../../lib/exceptions-queue/types";

const EXCEPTION_TYPE_LABEL: Record<FinanceExceptionType, string> = {
  unposted_document: "Unposted document",
  itc_at_risk: "ITC at risk",
  filing_blocker: "Filing blocker",
};

/** FIN-1: icon + text + color, never color alone -- same discipline as the reconciliation
 * queue's own `StatusBadge`. */
function StatusBadge({ status }: { status: FinanceExceptionStatus }) {
  if (status === "resolved") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/15 text-success-foreground">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Resolved
      </Badge>
    );
  }
  if (status === "ignored") {
    return (
      <Badge variant="secondary" className="gap-1">
        <XCircle className="size-3" aria-hidden="true" />
        Ignored
      </Badge>
    );
  }
  if (status === "in_review") {
    return (
      <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-primary">
        <Search className="size-3" aria-hidden="true" />
        In review
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

function OwnerBadge({ exception, viewerId }: { exception: FinanceException; viewerId: string | null }) {
  if (!exception.ownerId) return <span className="text-xs text-muted-foreground">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-foreground">
      <CircleDot className="size-3 text-primary" aria-hidden="true" />
      {exception.ownerId === viewerId ? "You" : "Assigned"}
    </span>
  );
}

/** `[Start review] [Resolve] [Ignore]` on an open exception, `[Back to open] [Resolve]
 * [Ignore]` on one already being looked at, nothing on a terminal one (`resolved`/
 * `ignored` never accept another transition -- see `mutations.ts`'s own transition
 * matrix). `[Claim]`/`[Unclaim]` is independent of status. */
function RowActions({
  exception,
  viewerId,
  reviewAction,
  reopenAction,
  resolveAction,
  ignoreAction,
  claimAction,
  unclaimAction,
}: {
  exception: FinanceException;
  viewerId: string | null;
  reviewAction: (exceptionId: string) => Promise<void>;
  reopenAction: (exceptionId: string) => Promise<void>;
  resolveAction: (exceptionId: string) => Promise<void>;
  ignoreAction: (exceptionId: string) => Promise<void>;
  claimAction: (exceptionId: string) => Promise<void>;
  unclaimAction: (exceptionId: string) => Promise<void>;
}) {
  const terminal = exception.status === "resolved" || exception.status === "ignored";
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!terminal && viewerId ? (
        <form action={(exception.ownerId === viewerId ? unclaimAction : claimAction).bind(null, exception.id)}>
          <SubmitButton variant="ghost" size="sm">
            {exception.ownerId === viewerId ? "Unclaim" : "Claim"}
          </SubmitButton>
        </form>
      ) : null}
      {exception.status === "open" ? (
        <form action={reviewAction.bind(null, exception.id)}>
          <SubmitButton variant="outline" size="sm">
            Start review
          </SubmitButton>
        </form>
      ) : null}
      {exception.status === "in_review" ? (
        <form action={reopenAction.bind(null, exception.id)}>
          <SubmitButton variant="outline" size="sm">
            Back to open
          </SubmitButton>
        </form>
      ) : null}
      {!terminal ? (
        <>
          <form action={resolveAction.bind(null, exception.id)}>
            <SubmitButton variant="outline" size="sm">
              Resolve
            </SubmitButton>
          </form>
          <form action={ignoreAction.bind(null, exception.id)}>
            <SubmitButton variant="ghost" size="sm">
              Ignore
            </SubmitButton>
          </form>
        </>
      ) : null}
      {terminal ? <span className="text-xs text-muted-foreground">—</span> : null}
    </div>
  );
}

export function FinanceExceptionsList({
  exceptions,
  viewerId,
  reviewAction,
  reopenAction,
  resolveAction,
  ignoreAction,
  claimAction,
  unclaimAction,
}: {
  exceptions: FinanceException[];
  viewerId: string | null;
  reviewAction: (exceptionId: string) => Promise<void>;
  reopenAction: (exceptionId: string) => Promise<void>;
  resolveAction: (exceptionId: string) => Promise<void>;
  ignoreAction: (exceptionId: string) => Promise<void>;
  claimAction: (exceptionId: string) => Promise<void>;
  unclaimAction: (exceptionId: string) => Promise<void>;
}) {
  if (exceptions.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        message="Nothing in the queue -- either everything is clean, or it hasn't been synced yet."
      />
    );
  }

  const actionProps = { viewerId, reviewAction, reopenAction, resolveAction, ignoreAction, claimAction, unclaimAction };

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
            <p className="text-xs text-muted-foreground">{exception.impact}</p>
            {exception.suggestedAction ? (
              <p className="text-xs font-medium text-foreground">Suggested: {exception.suggestedAction}</p>
            ) : null}
            <OwnerBadge exception={exception} viewerId={viewerId} />
            <RowActions exception={exception} {...actionProps} />
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>What happened / why it matters</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {exceptions.map((exception) => (
            <TableRow key={exception.id}>
              <TableCell className="font-medium whitespace-nowrap align-top">{EXCEPTION_TYPE_LABEL[exception.exceptionType]}</TableCell>
              <TableCell className="align-top text-sm text-muted-foreground">
                <p>{exception.summary}</p>
                <p className="mt-1">{exception.impact}</p>
                {exception.suggestedAction ? <p className="mt-1 font-medium text-foreground">Suggested: {exception.suggestedAction}</p> : null}
              </TableCell>
              <TableCell className="align-top">
                <OwnerBadge exception={exception} viewerId={viewerId} />
              </TableCell>
              <TableCell className="align-top">
                <StatusBadge status={exception.status} />
              </TableCell>
              <TableCell className="align-top text-right">
                <RowActions exception={exception} {...actionProps} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
