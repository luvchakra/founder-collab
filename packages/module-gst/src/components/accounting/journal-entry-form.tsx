"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { entryTotals } from "../../lib/accounting/journal";
import { ledgerAmount } from "./labels";
import type { AccountWithBalance } from "../../lib/accounting/queries";

export type JournalEntryFormState = { error: string } | null;

interface LineDraft {
  key: number;
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
}

const emptyLine = (key: number): LineDraft => ({ key, accountId: "", debit: "", credit: "", memo: "" });

/**
 * A manual journal entry — the adjustment, accrual or correction no module produces on
 * its own.
 *
 * The running debit/credit totals are the point of the screen. Double entry is a
 * balancing act, and the one thing someone typing an entry needs to see at every moment
 * is how far off they still are; hiding that until submit turns a two-second correction
 * into a round trip. The same check runs again on the server and once more in the
 * database, so this is the fast feedback, not the enforcement.
 *
 * Lines stack into labelled blocks below `md` rather than shrinking: five fields across
 * a phone width is unusable, and an amount typed into the wrong column is a wrong ledger.
 */
export function JournalEntryForm({
  accounts,
  action,
  cancelHref,
  dimensions = {},
}: {
  accounts: AccountWithBalance[];
  action: (prevState: JournalEntryFormState, formData: FormData) => Promise<JournalEntryFormState>;
  cancelHref: string;
  /** FIN-9: the free-text dimensions this business switched on, by its own name for them.
   * Shown only when on, never required; applied to every line of the entry. */
  dimensions?: { location?: string; project?: string };
}) {
  const [state, formAction] = useActionState<JournalEntryFormState, FormData>(action, null);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(0), emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const totals = entryTotals(
    lines
      .filter((line) => line.accountId)
      .map((line) => ({
        accountId: line.accountId,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
      })),
  );

  const postable = accounts.filter((account) => account.is_active);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="posting_date">Posting date</Label>
          <Input
            id="posting_date"
            name="posting_date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="memo">Description</Label>
          <Input id="memo" name="memo" placeholder="Depreciation for September" />
        </div>
        {dimensions.location ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">{dimensions.location} (optional)</Label>
            <Input id="location" name="location" maxLength={120} />
          </div>
        ) : null}
        {dimensions.project ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project_ref">{dimensions.project} (optional)</Label>
            <Input id="project_ref" name="project_ref" maxLength={120} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <div className="hidden gap-3 px-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[2fr_1fr_1fr_1.5fr_auto]">
          <span>Account</span>
          <span className="text-right">Debit</span>
          <span className="text-right">Credit</span>
          <span>Memo</span>
          <span className="sr-only">Remove</span>
        </div>

        {lines.map((line, index) => (
          <div
            key={line.key}
            className="flex flex-col gap-3 rounded-xl border border-border p-3 md:grid md:grid-cols-[2fr_1fr_1fr_1.5fr_auto] md:items-center md:gap-3 md:rounded-none md:border-0 md:p-0"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`account-${line.key}`} className="md:sr-only">
                Account for line {index + 1}
              </Label>
              <NativeSelect
                id={`account-${line.key}`}
                name="account_id"
                value={line.accountId}
                onChange={(e) => update(line.key, { accountId: e.target.value })}
              >
                <option value="">Choose an account</option>
                {postable.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.account_number} — {account.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`debit-${line.key}`} className="md:sr-only">
                Debit on line {index + 1}
              </Label>
              <Input
                id={`debit-${line.key}`}
                name="debit"
                inputMode="decimal"
                className="md:text-right"
                value={line.debit}
                // A line is one side or the other; typing in one clears the other rather
                // than letting both carry an amount, which the ledger refuses anyway.
                onChange={(e) => update(line.key, { debit: e.target.value, credit: "" })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`credit-${line.key}`} className="md:sr-only">
                Credit on line {index + 1}
              </Label>
              <Input
                id={`credit-${line.key}`}
                name="credit"
                inputMode="decimal"
                className="md:text-right"
                value={line.credit}
                onChange={(e) => update(line.key, { credit: e.target.value, debit: "" })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`memo-${line.key}`} className="md:sr-only">
                Memo on line {index + 1}
              </Label>
              <Input
                id={`memo-${line.key}`}
                name="line_memo"
                value={line.memo}
                onChange={(e) => update(line.key, { memo: e.target.value })}
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove line ${index + 1}`}
              disabled={lines.length <= 2}
              onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              <span className="md:hidden">Remove line</span>
            </Button>
          </div>
        ))}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setLines((current) => [...current, emptyLine(nextKey)]);
              setNextKey((k) => k + 1);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add line
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-6">
          <span>
            <span className="text-muted-foreground">Debits </span>
            <span className="font-semibold tabular-nums">{ledgerAmount.format(totals.totalDebit)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Credits </span>
            <span className="font-semibold tabular-nums">{ledgerAmount.format(totals.totalCredit)}</span>
          </span>
        </div>
        <p aria-live="polite" className={totals.balanced ? "text-success-subtle" : "text-muted-foreground"}>
          {totals.balanced
            ? "Balanced — ready to post."
            : `Off by ${ledgerAmount.format(Math.abs(totals.difference))}.`}
        </p>
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm text-destructive-subtle">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" asChild>
          <a href={cancelHref}>Cancel</a>
        </Button>
        {/* Saving a draft is deliberately available while unbalanced: a draft is a work in
            progress, and being unable to save a half-built entry is what pushes people
            into keeping it in a spreadsheet instead. */}
        <SubmitButton name="intent" value="draft" variant="outline" pendingText="Saving...">
          Save as draft
        </SubmitButton>
        <SubmitButton name="intent" value="post" pendingText="Posting..." disabled={!totals.balanced}>
          Post entry
        </SubmitButton>
      </div>
    </form>
  );
}
