"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { RECURRENCE_LABEL, templateProblems, type RecurrenceFrequency } from "../../lib/accounting/recurring";
import { ledgerAmount } from "./labels";
import type { AccountWithBalance } from "../../lib/accounting/queries";

export type RecurringEntryActionState = { error: string } | { success: true } | null;

interface LineDraft {
  key: number;
  accountId: string;
  debit: string;
  credit: string;
}

const emptyLine = (key: number): LineDraft => ({ key, accountId: "", debit: "", credit: "" });

/**
 * Setting up an entry that posts itself.
 *
 * The balance check runs here as well as on the server and in the database, because this
 * is the only one of the three that can stop the mistake being made. An unbalanced
 * template would otherwise fail at the database every month, forever, with nobody
 * watching.
 */
export function RecurringEntryModal({
  accounts,
  action,
  onClose,
}: {
  accounts: AccountWithBalance[];
  action: (prevState: RecurringEntryActionState, formData: FormData) => Promise<RecurringEntryActionState>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<RecurringEntryActionState, FormData>(action, null);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(0), emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    firstFieldRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (state && "success" in state) onClose();
  }, [state, onClose]);

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const parsed = lines
    .filter((l) => l.accountId)
    .map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }));
  const problems = templateProblems(parsed);
  const total = parsed.reduce((s, l) => s + l.debit, 0);
  const postable = accounts.filter((a) => a.is_active);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-100 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-modal-title"
        className={`relative max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <h2 id="recurring-modal-title" className="text-lg font-semibold">
          New recurring entry
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Posts itself on the date you pick, every period, and catches up if a run is ever
          missed.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input ref={firstFieldRef} id="name" name="name" required placeholder="Office rent" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="frequency">How often</Label>
              <NativeSelect id="frequency" name="frequency" defaultValue="monthly">
                {(Object.keys(RECURRENCE_LABEL) as RecurrenceFrequency[]).map((f) => (
                  <option key={f} value={f}>
                    {RECURRENCE_LABEL[f]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="anchor_date">Starting</Label>
              <Input
                id="anchor_date"
                name="anchor_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
              {/* Month-end is the case worth saying out loud, since it is the one people
                  expect to go wrong. */}
              <p className="text-xs text-muted-foreground">
                Pick the 31st and it runs on the last day of shorter months, then returns to
                the 31st.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end_on">Until (optional)</Label>
            <Input id="end_on" name="end_on" type="date" />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Lines</Label>
            {lines.map((line, index) => (
              <div key={line.key} className="flex flex-col gap-2 rounded-xl border border-border p-2.5 sm:flex-row sm:items-center sm:gap-2">
                <NativeSelect
                  name="account_id"
                  aria-label={`Account for line ${index + 1}`}
                  value={line.accountId}
                  onChange={(e) => update(line.key, { accountId: e.target.value })}
                  className="sm:flex-1"
                >
                  <option value="">Choose an account</option>
                  {postable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_number} — {a.name}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  name="debit"
                  aria-label={`Debit on line ${index + 1}`}
                  placeholder="Debit"
                  inputMode="decimal"
                  className="sm:w-28"
                  value={line.debit}
                  onChange={(e) => update(line.key, { debit: e.target.value, credit: "" })}
                />
                <Input
                  name="credit"
                  aria-label={`Credit on line ${index + 1}`}
                  placeholder="Credit"
                  inputMode="decimal"
                  className="sm:w-28"
                  value={line.credit}
                  onChange={(e) => update(line.key, { credit: e.target.value, debit: "" })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove line ${index + 1}`}
                  disabled={lines.length <= 2}
                  onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setLines((c) => [...c, emptyLine(nextKey)]);
                setNextKey((k) => k + 1);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add line
            </Button>
          </div>

          <p aria-live="polite" className="text-sm">
            {problems.length === 0 ? (
              <span className="text-success-subtle">
                Balanced — {ledgerAmount.format(total)} every period.
              </span>
            ) : (
              <span className="text-muted-foreground">{problems[0]}</span>
            )}
          </p>

          {state && "error" in state ? (
            <p role="alert" className="text-sm text-destructive-subtle">
              {state.error}
            </p>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText="Saving..." disabled={problems.length > 0}>
              Create
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
