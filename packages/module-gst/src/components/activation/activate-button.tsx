"use client";

import { useActionState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { ActivateFinanceState } from "../../lib/activation/types";

/**
 * FIN-3 step 9/10 combined: this card IS the review (everything above it on the page is
 * the checklist) and the button IS "Activate" -- clicking it also runs FIN-2's backfill,
 * per the backlog's own note that the wizard is what runs it.
 */
export function ActivateButton({
  activatedAt,
  canActivate,
  activateAction,
}: {
  activatedAt: string | null;
  canActivate: boolean;
  activateAction: () => Promise<ActivateFinanceState>;
}) {
  const [state, formAction] = useActionState<ActivateFinanceState, FormData>(activateAction, { status: "idle" });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold">{activatedAt ? "Finance is active" : "Activate Finance"}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {activatedAt
          ? `Activated ${new Date(activatedAt).toLocaleDateString()}. Running this again catches up anything issued since.`
          : "Catches up the ledger on any history that predates this, then Finance is active."}
      </p>

      {canActivate ? (
        <form action={formAction} className="mt-3">
          <SubmitButton pendingText="Activating...">{activatedAt ? "Run again" : "Activate"}</SubmitButton>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">You don&apos;t have permission to activate Finance.</p>
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
            {state.firstActivation ? "Finance is now active" : "Backfill re-run complete"}
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            <li>{state.backfill.posted} newly posted</li>
            <li>{state.backfill.alreadyPosted} already posted</li>
            <li>{state.backfill.exceptions} routed to the exceptions queue</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
