"use client";

import { Badge } from "@cofounderai/core/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cofounderai/core/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import type {
  AgingRow,
  CustomerBalanceRow,
  JobsCompletedRow,
  MarketingSourceRevenueRow,
  PaymentRow,
  ProductivityRow,
  RevenueByGroupRow,
  TimecardRow,
} from "../../lib/reports/types";

const AGING_VARIANT: Record<AgingRow["aging_bucket"], "secondary" | "outline" | "default" | "destructive"> = {
  current: "secondary",
  "1-30": "outline",
  "31-60": "default",
  "61-90": "destructive",
  "90+": "destructive",
};

function EmptyRow({ label }: { label: string }) {
  return <EmptyState variant="inline" message={label} />;
}

function RevenueTable({ rows, emptyLabel }: { rows: RevenueByGroupRow[] | MarketingSourceRevenueRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <EmptyRow label={emptyLabel} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="break-words">{r.label}</TableCell>
              <TableCell className="text-right font-medium">{inr.format(r.revenue)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** `/fsm/reports`'s own content -- nine MUST-scope reports (PRD §2 Reports row) as
 * tabbed, read-only tables. No date-range picker, no custom report builder (explicit
 * SHOULD/LATER) -- each report shows its own natural default period (all-time for
 * revenue/balances/aging/payments, current month for timecards/productivity). */
export function ReportsView({
  jobsCompleted,
  revenueByService,
  revenueByTag,
  revenueByChargeType,
  revenueByMarketingSource,
  customerBalances,
  aging,
  payments,
  timecards,
  productivity,
}: {
  jobsCompleted: JobsCompletedRow[];
  revenueByService: RevenueByGroupRow[];
  revenueByTag: RevenueByGroupRow[];
  revenueByChargeType: RevenueByGroupRow[];
  revenueByMarketingSource: MarketingSourceRevenueRow[];
  customerBalances: CustomerBalanceRow[];
  aging: AgingRow[];
  payments: PaymentRow[];
  timecards: TimecardRow[];
  productivity: ProductivityRow[];
}) {
  return (
    <Tabs defaultValue="jobs-completed">
      {/* Ten tabs don't fit one row on a phone -- the base TabsList's fixed `h-9` (sized
          for exactly one row) meant the previous `flex-wrap` override just let wrapped
          rows overflow that fixed height and visually overlap the content below instead
          of actually wrapping in place. A single horizontally-scrollable row (each
          trigger `shrink-0` so flexbox can't squeeze them instead of scrolling) reads
          better as a tab strip than a multi-row grid of buttons anyway. */}
      <TabsList className="flex w-full justify-start gap-1 overflow-x-auto">
        <TabsTrigger value="jobs-completed" className="shrink-0">Jobs completed</TabsTrigger>
        <TabsTrigger value="revenue-service" className="shrink-0">Revenue by service</TabsTrigger>
        <TabsTrigger value="revenue-tag" className="shrink-0">Revenue by tag</TabsTrigger>
        <TabsTrigger value="revenue-charge-type" className="shrink-0">Revenue by charge type</TabsTrigger>
        <TabsTrigger value="marketing-sources" className="shrink-0">Marketing sources</TabsTrigger>
        <TabsTrigger value="customer-balances" className="shrink-0">Customer balances</TabsTrigger>
        <TabsTrigger value="aging" className="shrink-0">Account aging</TabsTrigger>
        <TabsTrigger value="payments" className="shrink-0">Payments</TabsTrigger>
        <TabsTrigger value="timecards" className="shrink-0">Timecards</TabsTrigger>
        <TabsTrigger value="productivity" className="shrink-0">Productivity</TabsTrigger>
      </TabsList>

      <TabsContent value="jobs-completed">
        {jobsCompleted.length === 0 ? (
          <EmptyRow label="No completed jobs yet." />
        ) : (
          <div className="rounded-lg border border-border">
            <ul className="divide-y md:hidden">
              {jobsCompleted.map((j) => (
                <li key={j.id} className="flex flex-col gap-1 p-3 text-sm">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 break-words font-medium">{j.party_name}</p>
                    <p className="shrink-0 font-medium">{inr.format(j.invoiced_amount)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{j.number ?? "-"}</span>
                    <span>{j.service_type_name ?? "-"}</span>
                    <span>{formatDate(j.completed_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Job #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobsCompleted.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>{j.number ?? "-"}</TableCell>
                    <TableCell>{j.party_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{j.service_type_name ?? "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(j.completed_at)}</TableCell>
                    <TableCell className="text-right">{inr.format(j.invoiced_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="revenue-service">
        <RevenueTable rows={revenueByService} emptyLabel="No invoiced revenue yet." />
      </TabsContent>
      <TabsContent value="revenue-tag">
        <RevenueTable rows={revenueByTag} emptyLabel="No invoiced revenue yet." />
      </TabsContent>
      <TabsContent value="revenue-charge-type">
        <RevenueTable rows={revenueByChargeType} emptyLabel="No invoiced charges yet." />
      </TabsContent>
      <TabsContent value="marketing-sources">
        <RevenueTable rows={revenueByMarketingSource} emptyLabel="No invoiced revenue yet." />
      </TabsContent>

      <TabsContent value="customer-balances">
        {customerBalances.length === 0 ? (
          <EmptyRow label="No outstanding balances." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerBalances.map((c) => (
                  <TableRow key={c.party_id}>
                    <TableCell className="break-words">{c.party_name}</TableCell>
                    <TableCell className="text-right font-medium">{inr.format(c.balance_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="aging">
        {aging.length === 0 ? (
          <EmptyRow label="Nothing overdue." />
        ) : (
          <div className="rounded-lg border border-border">
            <ul className="divide-y md:hidden">
              {aging.map((a) => (
                <li key={a.document_id} className="flex flex-col gap-1 p-3 text-sm">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 break-words font-medium">{a.party_name}</p>
                    <p className="shrink-0 font-medium">{inr.format(a.balance_amount)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{a.number ?? "-"}</span>
                    <span>Due {formatDate(a.due_date)}</span>
                    <Badge variant={AGING_VARIANT[a.aging_bucket]}>{a.aging_bucket}</Badge>
                  </div>
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Bucket</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.map((a) => (
                  <TableRow key={a.document_id}>
                    <TableCell>{a.number ?? "-"}</TableCell>
                    <TableCell>{a.party_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(a.due_date)}</TableCell>
                    <TableCell>
                      <Badge variant={AGING_VARIANT[a.aging_bucket]}>{a.aging_bucket}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{inr.format(a.balance_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="payments">
        {payments.length === 0 ? (
          <EmptyRow label="No payments recorded yet." />
        ) : (
          <div className="rounded-lg border border-border">
            <ul className="divide-y md:hidden">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 p-3 text-sm">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 break-words font-medium">{p.party_name}</p>
                    <p className="shrink-0 font-medium">{inr.format(p.amount)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(p.payment_date)}</span>
                    <span>{p.method}</span>
                    {p.reference ? <span className="break-all">{p.reference}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(p.payment_date)}</TableCell>
                    <TableCell>{p.party_name}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.reference ?? "-"}</TableCell>
                    <TableCell className="text-right">{inr.format(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="timecards">
        <p className="mb-3 text-xs text-muted-foreground">This calendar month.</p>
        {timecards.length === 0 ? (
          <EmptyRow label="No time entries this month." />
        ) : (
          <div className="rounded-lg border border-border">
            <ul className="divide-y md:hidden">
              {timecards.map((t) => (
                <li key={t.employee_name} className="flex flex-col gap-1 p-3 text-sm">
                  <p className="font-medium break-words">{t.employee_name}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      Total <span className="font-medium text-foreground">{t.total_hours}h</span>
                    </span>
                    <span>
                      Billable <span className="font-medium text-foreground">{t.billable_hours}h</span>
                    </span>
                    <span>
                      Entries <span className="font-medium text-foreground">{t.entry_count}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Total hours</TableHead>
                  <TableHead className="text-right">Billable hours</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timecards.map((t) => (
                  <TableRow key={t.employee_name}>
                    <TableCell>{t.employee_name}</TableCell>
                    <TableCell className="text-right">{t.total_hours}</TableCell>
                    <TableCell className="text-right">{t.billable_hours}</TableCell>
                    <TableCell className="text-right">{t.entry_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="productivity">
        <p className="mb-3 text-xs text-muted-foreground">This calendar month.</p>
        {productivity.length === 0 ? (
          <EmptyRow label="No activity this month." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Jobs completed</TableHead>
                  <TableHead className="text-right">Hours logged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productivity.map((p) => (
                  <TableRow key={p.employee_name}>
                    <TableCell className="break-words">{p.employee_name}</TableCell>
                    <TableCell className="text-right">{p.jobs_completed}</TableCell>
                    <TableCell className="text-right">{p.total_hours}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
