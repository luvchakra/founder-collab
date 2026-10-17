"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { ACCOUNT_TYPE_LABEL, ledgerAmount } from "./labels";
import { parseAmountCell } from "../../lib/accounting/budget-entry";
import type { BudgetGridAccount } from "../../lib/accounting/budget-queries";
import type { SaveBudgetResult } from "../../lib/accounting/budget-mutations";

export interface BudgetMonth {
  startDate: string;
  label: string;
}

const cellKey = (accountId: string, month: string) => `${accountId}|${month}`;

function initialCells(amounts: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, String(v)]));
}

/**
 * FIN-BUDGET-ENTRY — the budget grid: one figure per account per month, saved together.
 *
 * Accounts down, months across on wide screens — the shape a budget is planned in. Twelve
 * month columns don't fit a phone or a narrow tablet, so below `lg` each account becomes a
 * card with its twelve months as labelled fields. A blank cell means "no budget for that
 * month"; clearing one removes the figure on save.
 */
export function BudgetEntryForm({
  fiscalYear,
  fiscalYearOptions,
  months,
  accounts,
  amounts,
  action,
}: {
  fiscalYear: number;
  fiscalYearOptions: { value: number; label: string }[];
  months: BudgetMonth[];
  accounts: BudgetGridAccount[];
  amounts: Record<string, number>;
  action: (input: {
    fiscalYear: number;
    lines: { accountId: string; periodStart: string; amount: number | null }[];
  }) => Promise<SaveBudgetResult>;
}) {
  const router = useRouter();
  const [cells, setCells] = useState<Record<string, string>>(() => initialCells(amounts));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const invalid = useMemo(
    () => Object.entries(cells).filter(([, v]) => parseAmountCell(v) === "invalid").map(([k]) => k),
    [cells],
  );

  const rowTotal = (accountId: string) =>
    months.reduce((sum, m) => {
      const v = parseAmountCell(cells[cellKey(accountId, m.startDate)] ?? "");
      return typeof v === "number" ? sum + v : sum;
    }, 0);

  const setCell = (accountId: string, month: string, value: string) => {
    setCells((current) => ({ ...current, [cellKey(accountId, month)]: value }));
    setDirty(true);
    setMessage(null);
  };

  const changeYear = (value: string) => {
    if (dirty && !window.confirm("Discard the figures you haven't saved?")) return;
    router.push(`?fy=${value}`);
  };

  const save = () => {
    if (invalid.length > 0) {
      setMessage({ tone: "error", text: "Some figures aren't numbers. Fix the highlighted fields first." });
      return;
    }
    const lines = accounts.flatMap((a) =>
      months.map((m) => {
        const v = parseAmountCell(cells[cellKey(a.id, m.startDate)] ?? "");
        return { accountId: a.id, periodStart: m.startDate, amount: typeof v === "number" ? v : null };
      }),
    );
    startTransition(async () => {
      try {
        const result = await action({ fiscalYear, lines });
        if (!result.ok) {
          setMessage({ tone: "error", text: result.error });
          return;
        }
        setDirty(false);
        setMessage({
          tone: "ok",
          text: result.changed === 0 ? "Nothing had changed." : `Saved ${result.changed} figure${result.changed === 1 ? "" : "s"}.`,
        });
        router.refresh();
      } catch (err) {
        setMessage({ tone: "error", text: err instanceof Error ? err.message : "The budget could not be saved." });
      }
    });
  };

  const amountInput = (account: BudgetGridAccount, month: BudgetMonth, id?: string) => {
    const key = cellKey(account.id, month.startDate);
    return (
      <Input
        id={id}
        inputMode="decimal"
        aria-label={`${account.name}, ${month.label}`}
        aria-invalid={invalid.includes(key) || undefined}
        className="h-8 min-w-0 px-2 text-right tabular-nums"
        value={cells[key] ?? ""}
        onChange={(e) => setCell(account.id, month.startDate, e.target.value)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="budget-fiscal-year">Fiscal year</Label>
          <NativeSelect id="budget-fiscal-year" value={String(fiscalYear)} onChange={(e) => changeYear(e.target.value)}>
            {fiscalYearOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-center gap-3">
          {message ? (
            <p role="status" className={message.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {message.text}
            </p>
          ) : null}
          <Button onClick={save} disabled={pending || accounts.length === 0}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Below lg: one card per account, months as labelled fields. */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {accounts.map((account) => (
          <li key={account.id} className="rounded-2xl border border-border p-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium break-words">{account.name}</p>
                <p className="text-xs text-muted-foreground">
                  {account.accountNumber} · {ACCOUNT_TYPE_LABEL[account.type]}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular-nums">{ledgerAmount.format(rowTotal(account.id))}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {months.map((month) => {
                const id = `m-${account.id}-${month.startDate}`;
                return (
                  <div key={month.startDate} className="flex flex-col gap-1">
                    <Label htmlFor={id} className="text-xs text-muted-foreground">
                      {month.label}
                    </Label>
                    {amountInput(account, month, id)}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Account</TableHead>
              {months.map((m) => (
                <TableHead key={m.startDate} className="min-w-24 text-right">
                  {m.label}
                </TableHead>
              ))}
              <TableHead className="min-w-28 text-right">Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {account.accountNumber} · {ACCOUNT_TYPE_LABEL[account.type]}
                  </p>
                </TableCell>
                {months.map((month) => (
                  <TableCell key={month.startDate} className="px-1">
                    {amountInput(account, month)}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(rowTotal(account.id))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
