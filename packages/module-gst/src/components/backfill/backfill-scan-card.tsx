"use client";

import { useActionState } from "react";
import { CheckCircle2, ListChecks } from "lucide-react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { BackfillRunState } from "../../lib/backfill/types";

/**
 * FIN-2: the scan counts plus the run button, and -- once run -- what happened. A client
 * component because the result only exists after the button is pressed; the scan counts
 * themselves are server-rendered props, not re-fetched here.
 */
export function BackfillScanCard({
  documentCount,
  paymentCount,
  canRun,
  runAction,
}: {
  documentCount: number;
  paymentCount: number;
  canRun: boolean;
  runAction: () => Promise<BackfillRunState>;
}) {
  const [state, formAction] = useActionState<BackfillRunState, FormData>(runAction, { status: "idle" });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <ListChecks className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold">What the scan found</h2>
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">{documentCount}</span> document{documentCount === 1 ? "" : "s"} (invoices, bills, credit and debit
          notes) with no ledger entry
        </li>
        <li>
          <span className="font-medium text-foreground">{paymentCount}</span> payment{paymentCount === 1 ? "" : "s"} with no settlement entry
        </li>
      </ul>

      {canRun ? (
        <form action={formAction} className="mt-4">
          <SubmitButton pendingText="Running...">Run backfill</SubmitButton>
        </form>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">You don&apos;t have permission to run the backfill.</p>
      )}

      {state.status === "error" ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {state.status === "done" ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            Backfill complete
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            <li>{state.result.posted} newly posted</li>
            <li>{state.result.alreadyPosted} already posted (no change)</li>
            <li>{state.result.noConsequence} had nothing to post</li>
            <li>
              {state.result.exceptions} routed to the exceptions queue{state.result.exceptions > 0 ? " for review" : ""}
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
