"use client";

import { CalendarRange } from "lucide-react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { formatDate } from "@cofounderai/core/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import {
  PERIOD_STATUS_LABEL,
  allowedPeriodTransitions,
  fiscalYearLabel,
  type PeriodStatus,
} from "../../lib/accounting/periods";
import type { AccountingPeriodRow } from "../../lib/accounting/queries";

/** The wording each transition gets as a button — "Lock" says what happens, where the
 * target status alone ("Locked") reads like a label rather than an action. */
const TRANSITION_LABEL: Record<PeriodStatus, string> = {
  open: "Reopen",
  review: "Start review",
  locked: "Lock",
  filed: "Mark filed",
  closed: "Close",
};

/**
 * The accounting calendar: which months are open to posting, which are locked while
 * they're reconciled, and which have been filed and are now history.
 *
 * Grouped by fiscal year with the most recent first, because the close always works
 * backwards from the month that just ended. Each period carries its own transitions
 * rather than a single global "close the year" control — a business closes month by
 * month, and the one period someone needs to reopen is a row, not a year.
 */
export function AccountingPeriodsView({
  periods,
  openableFiscalYears,
  fiscalYearStartMonth,
  canManage,
  openFiscalYearAction,
  setStatusAction,
}: {
  periods: AccountingPeriodRow[];
  /** Fiscal years with no periods yet, newest first. */
  openableFiscalYears: number[];
  fiscalYearStartMonth: number;
  canManage: boolean;
  openFiscalYearAction: (fiscalYear: number) => Promise<void>;
  setStatusAction: (periodId: string, status: PeriodStatus) => Promise<void>;
}) {
  const byYear = new Map<number, AccountingPeriodRow[]>();
  for (const period of periods) {
    byYear.set(period.fiscal_year, [...(byYear.get(period.fiscal_year) ?? []), period]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  if (periods.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-12 text-center">
        <CalendarRange className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="max-w-md">
          <p className="font-medium">No accounting periods yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a fiscal year to get twelve monthly periods. Until then nothing is locked —
            entries post freely, and there is no month to close.
          </p>
        </div>
        {canManage ? (
          <OpenYearButtons years={openableFiscalYears} action={openFiscalYearAction} start={fiscalYearStartMonth} />
        ) : (
          <p className="text-sm text-muted-foreground">Ask an owner or admin to open a fiscal year.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage && openableFiscalYears.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <OpenYearButtons years={openableFiscalYears} action={openFiscalYearAction} start={fiscalYearStartMonth} />
        </div>
      ) : null}

      {years.map((year) => (
        <section key={year} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {fiscalYearLabel(year, fiscalYearStartMonth)}
          </h2>

          <div className="rounded-2xl border border-border">
            {/* Mobile: one card per period. */}
            <ul className="divide-y md:hidden">
              {byYear.get(year)!.map((period) => (
                <li key={period.id} className="flex flex-col gap-2 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{period.gst_period ?? formatDate(period.start_date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(period.start_date)} – {formatDate(period.end_date)}
                      </p>
                    </div>
                    <StatusBadge status={period.status} label={PERIOD_STATUS_LABEL[period.status]} />
                  </div>
                  {canManage ? <PeriodActions period={period} setStatusAction={setStatusAction} /> : null}
                </li>
              ))}
            </ul>

            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Period</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-44">Closed</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {byYear.get(year)!.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell className="font-medium tabular-nums">
                      {period.gst_period ?? formatDate(period.start_date)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(period.start_date)} – {formatDate(period.end_date)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={period.status} label={PERIOD_STATUS_LABEL[period.status]} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {period.closed_at ? formatDate(period.closed_at) : "—"}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <PeriodActions period={period} setStatusAction={setStatusAction} align="end" />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}

function OpenYearButtons({
  years,
  action,
  start,
}: {
  years: number[];
  action: (fiscalYear: number) => Promise<void>;
  start: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {years.map((year) => (
        <form key={year} action={action.bind(null, year)}>
          <SubmitButton size="sm" variant={year === years[0] ? "default" : "outline"} pendingText="Opening...">
            Open {fiscalYearLabel(year, start)}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}

/**
 * Only the transitions this period can actually make, so nothing on screen leads to a
 * refusal. Reopening is separated from the forward actions — it moves backwards through
 * the close, and shouldn't sit in the same run of buttons as "Lock" and "Close".
 */
function PeriodActions({
  period,
  setStatusAction,
  align = "start",
}: {
  period: AccountingPeriodRow;
  setStatusAction: (periodId: string, status: PeriodStatus) => Promise<void>;
  align?: "start" | "end";
}) {
  const transitions = allowedPeriodTransitions(period.status);
  if (transitions.length === 0) {
    return (
      <p className={`text-xs text-muted-foreground ${align === "end" ? "text-right" : ""}`}>
        Final — post corrections in an open period.
      </p>
    );
  }

  const forward = transitions.filter((t) => t !== "open" && t !== "review");
  const backward = transitions.filter((t) => t === "open" || t === "review");

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${align === "end" ? "justify-end" : ""}`}>
      {backward.map((status) => (
        <form key={status} action={setStatusAction.bind(null, period.id, status)}>
          <SubmitButton variant="ghost" size="sm">
            {TRANSITION_LABEL[status]}
          </SubmitButton>
        </form>
      ))}
      {forward.map((status, i) => (
        <form key={status} action={setStatusAction.bind(null, period.id, status)}>
          <SubmitButton variant={i === 0 ? "outline" : "ghost"} size="sm">
            {TRANSITION_LABEL[status]}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}
