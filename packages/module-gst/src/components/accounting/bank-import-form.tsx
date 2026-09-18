"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { ParseProblem } from "../../lib/accounting/bank-statement-import";

export type ImportActionState =
  | { error: string }
  | { imported: number; duplicates: number; problems: ParseProblem[] }
  | null;

/**
 * Importing a statement.
 *
 * Takes a pasted CSV as well as a file, because a founder reconciling on a phone has the
 * statement open in another tab far more often than as a file they can pick.
 *
 * The result always names what happened to every row: imported, already here, or
 * unreadable-and-why. A statement that imports "successfully" with four rows missing
 * produces a reconciliation that will not balance and nothing on screen to explain it.
 */
export function BankImportForm({
  action,
}: {
  action: (prevState: ImportActionState, formData: FormData) => Promise<ImportActionState>;
}) {
  const [state, formAction] = useActionState<ImportActionState, FormData>(action, null);

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Upload className="size-4" aria-hidden="true" />
        Import a statement
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste your bank&apos;s CSV export, or choose the file. Re-importing an overlapping
        period is safe — rows already here are recognised and skipped.
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="statement_file">Statement file</Label>
          <input
            id="statement_file"
            name="statement_file"
            type="file"
            accept=".csv,text/csv,text/plain"
            className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="statement_csv">Or paste the CSV</Label>
          <Textarea
            id="statement_csv"
            name="statement_csv"
            rows={4}
            placeholder="Date,Narration,Withdrawal Amt,Deposit Amt,Closing Balance"
            className="font-mono text-xs"
          />
        </div>

        <div className="flex justify-end">
          <SubmitButton size="sm" pendingText="Importing...">
            Import
          </SubmitButton>
        </div>
      </form>

      {state && "error" in state ? (
        <p role="alert" className="mt-3 text-sm text-destructive-subtle">
          {state.error}
        </p>
      ) : null}

      {state && "imported" in state ? (
        <div className="mt-3 flex flex-col gap-2 text-sm" aria-live="polite">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success-subtle" aria-hidden="true" />
            {state.imported} imported
            {state.duplicates > 0 ? `, ${state.duplicates} already here` : ""}.
          </p>
          {state.problems.length > 0 ? (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="flex items-center gap-2 font-medium text-warning-subtle">
                <AlertTriangle className="size-4" aria-hidden="true" />
                {state.problems.length} row{state.problems.length === 1 ? "" : "s"} couldn&apos;t be read
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                {state.problems.slice(0, 6).map((problem) => (
                  <li key={`${problem.line}-${problem.reason}`}>
                    <span className="font-medium">Line {problem.line}:</span> {problem.reason}
                  </li>
                ))}
                {state.problems.length > 6 ? <li>…and {state.problems.length - 6} more.</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
