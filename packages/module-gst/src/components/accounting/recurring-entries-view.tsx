"use client";

import { useState } from "react";
import { Plus, Repeat } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { formatDate } from "@cofounderai/core/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { RECURRENCE_LABEL } from "../../lib/accounting/recurring";
import { RecurringEntryModal, type RecurringEntryActionState } from "./recurring-entry-modal";
import { ledgerAmount } from "./labels";
import type { AccountWithBalance } from "../../lib/accounting/queries";
import type { RecurringEntryWithSchedule } from "../../lib/accounting/recurring-queries";

/**
 * Entries that post themselves.
 *
 * "Next run" is the column that matters — it is the whole reason someone opens this page,
 * to check that the thing they set up months ago is still going to happen. A paused
 * template says so rather than showing a date it will not honour.
 */
export function RecurringEntriesView({
  entries,
  accounts,
  canManage,
  createAction,
  setActiveAction,
}: {
  entries: RecurringEntryWithSchedule[];
  accounts: AccountWithBalance[];
  canManage: boolean;
  createAction: (
    prevState: RecurringEntryActionState,
    formData: FormData,
  ) => Promise<RecurringEntryActionState>;
  setActiveAction: (id: string, isActive: boolean) => Promise<void>;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New recurring entry
          </Button>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <Repeat className="size-8 text-muted-foreground" aria-hidden="true" />
          <div className="max-w-md">
            <p className="font-medium">Nothing recurring yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Rent, depreciation, subscriptions — anything you post the same way every month.
              Set it up once and it posts itself, catching up if a run is ever missed.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">{RECURRENCE_LABEL[entry.frequency]}</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{ledgerAmount.format(entry.amount)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {entry.is_active ? (
                    <span>Next {entry.nextRunOn ? formatDate(entry.nextRunOn) : "— finished"}</span>
                  ) : (
                    <Badge variant="outline">Paused</Badge>
                  )}
                </div>
                {canManage ? (
                  <form action={setActiveAction.bind(null, entry.id, !entry.is_active)} className="self-end">
                    <SubmitButton variant="ghost" size="sm">
                      {entry.is_active ? "Pause" : "Resume"}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-44">How often</TableHead>
                <TableHead className="w-36">Next run</TableHead>
                <TableHead className="w-36">Last run</TableHead>
                <TableHead className="w-36 text-right">Amount</TableHead>
                {canManage ? <TableHead className="w-24 text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className={entry.is_active ? undefined : "opacity-60"}>
                  <TableCell className="font-medium">
                    {entry.name}
                    {entry.is_active ? null : (
                      <Badge variant="outline" className="ml-2">
                        Paused
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{RECURRENCE_LABEL[entry.frequency]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {!entry.is_active ? "—" : entry.nextRunOn ? formatDate(entry.nextRunOn) : "Finished"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.last_run_on ? formatDate(entry.last_run_on) : "Never"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {ledgerAmount.format(entry.amount)}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <form action={setActiveAction.bind(null, entry.id, !entry.is_active)}>
                        <SubmitButton variant="ghost" size="sm">
                          {entry.is_active ? "Pause" : "Resume"}
                        </SubmitButton>
                      </form>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showModal ? (
        <RecurringEntryModal accounts={accounts} action={createAction} onClose={() => setShowModal(false)} />
      ) : null}
    </div>
  );
}
