"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { ledgerAmount } from "./labels";

export type ReconcileActionState =
  | { error: string }
  | { difference: number; reconciled: boolean }
  | null;

/**
 * Signing off an account against a statement.
 *
 * A difference doesn't block completion. A known, explained gap that someone accepted is
 * a normal outcome, and refusing to record it would push the reconciliation into a
 * spreadsheet where nobody can see it — the result says plainly whether it came out clean.
 */
export function ReconcileForm({
  unmatchedCount,
  defaultStart,
  defaultEnd,
  action,
}: {
  unmatchedCount: number;
  defaultStart: string;
  defaultEnd: string;
  action: (prevState: ReconcileActionState, formData: FormData) => Promise<ReconcileActionState>;
}) {
  const [state, formAction] = useActionState<ReconcileActionState, FormData>(action, null);

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Reconcile</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the closing balance from your statement. Finance compares it with what the
        matched entries add up to.
      </p>

      {unmatchedCount > 0 ? (
        <p className="mt-2 text-sm text-warning-subtle">
          {unmatchedCount} line{unmatchedCount === 1 ? " is" : "s are"} still unmatched. You can
          still record this, but the sign-off will say it wasn&apos;t clean.
        </p>
      ) : null}

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="statement_start">Statement from</Label>
            <Input id="statement_start" name="statement_start" type="date" required defaultValue={defaultStart} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="statement_end">to</Label>
            <Input id="statement_end" name="statement_end" type="date" required defaultValue={defaultEnd} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="statement_closing_balance">Closing balance per statement</Label>
          <Input
            id="statement_closing_balance"
            name="statement_closing_balance"
            inputMode="decimal"
            required
            placeholder="0.00"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" name="notes" rows={2} placeholder="Cheque 4412 not yet cleared" />
        </div>

        <div className="flex justify-end">
          <SubmitButton size="sm" pendingText="Recording...">
            Record reconciliation
          </SubmitButton>
        </div>
      </form>

      {state && "error" in state ? (
        <p role="alert" className="mt-3 text-sm text-destructive-subtle">
          {state.error}
        </p>
      ) : null}

      {state && "difference" in state ? (
        <p
          aria-live="polite"
          className={`mt-3 flex items-center gap-2 text-sm ${state.reconciled ? "text-success-subtle" : "text-warning-subtle"}`}
        >
          {state.reconciled ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
          {state.reconciled
            ? "Reconciled — the statement and the ledger agree, with nothing left over."
            : `Recorded with a difference of ${ledgerAmount.format(Math.abs(state.difference))}. ${
                state.difference > 0
                  ? "The bank holds more than the books account for."
                  : "The books account for more than the bank holds."
              }`}
        </p>
      ) : null}
    </section>
  );
}
