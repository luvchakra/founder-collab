"use client";

import { Badge } from "@cofounderai/core/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cofounderai/core/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@cofounderai/core/ui/table";
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
const AGING_BUCKETS: AgingRow["aging_bucket"][] = ["current", "1-30", "31-60", "61-90", "90+"];

function EmptyRow({ label }: { label: string }) {
  return <EmptyState variant="inline" message={label} />;
}

/** A small KPI tile -- used to put "more info" (totals, counts) above a report's own
 * table without inventing a full dashboard-widget system for it. */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">{children}</div>;
}

function RevenueTable({ rows, emptyLabel }: { rows: RevenueByGroupRow[] | MarketingSourceRevenueRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <EmptyRow label={emptyLabel} />;
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  return (
    <div className="flex flex-col gap-4">
      <StatRow>
        <StatTile label="Total revenue" value={inr.format(total)} />
        <StatTile label="Groups" value={String(rows.length)} />
      </StatRow>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">% of total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell className="break-words">{r.label}</TableCell>
                <TableCell className="text-right font-medium">{inr.format(r.revenue)}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{total > 0 ? `${Math.round((r.revenue / total) * 100)}%` : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell className="text-right font-medium">{inr.format(total)}</TableCell>
              <TableCell className="text-right">100%</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}

/** `/fsm/reports`'s own content -- nine MUST-scope reports (PRD §2 Reports row) as
 * tabbed tables, each with a KPI summary and (where the row maps to one real record) a
 * link to that record's own detail page. Jobs completed / revenue-by-* / payments /
 * timecards / productivity honor the page's own date-range control (`isDefaultRange`
 * tells the "as of today" tabs apart from the range-filtered ones); customer balances and
 * account aging are current-state snapshots and always show today's numbers regardless of
 * the selected range. */
export function ReportsView({
  businessId,
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
  isDefaultRange,
}: {
  businessId: string;
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
  isDefaultRange: boolean;
}) {
  const jobHref = (id: string) => `/dashboard/businesses/${businessId}/fsm/jobs/${id}`;
  const invoiceHref = (id: string) => `/dashboard/businesses/${businessId}/fsm/invoices/${id}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-5">
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

        <TabsContent value="jobs-completed" className="flex flex-col gap-4 pt-4">
          {jobsCompleted.length === 0 ? (
            <EmptyRow label="No completed jobs in this period." />
          ) : (
            <>
              <StatRow>
                <StatTile label="Jobs completed" value={String(jobsCompleted.length)} />
                <StatTile label="Total invoiced" value={inr.format(jobsCompleted.reduce((sum, j) => sum + j.invoiced_amount, 0))} />
              </StatRow>
              <div className="rounded-lg border border-border">
                <ul className="divide-y md:hidden">
                  {jobsCompleted.map((j) => (
                    <li key={j.id}>
                      <a href={jobHref(j.id)} className="flex flex-col gap-1 p-3 text-sm transition-colors hover:bg-muted/40">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <p className="min-w-0 break-words font-medium">{j.party_name}</p>
                          <p className="shrink-0 font-medium">{inr.format(j.invoiced_amount)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>{j.number ?? "-"}</span>
                          <span>{j.service_type_name ?? "-"}</span>
                          <span>{formatDate(j.completed_at)}</span>
                        </div>
                      </a>
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
                        <TableCell>
                          <a href={jobHref(j.id)} className="font-medium hover:underline">
                            {j.number ?? "View"}
                          </a>
                        </TableCell>
                        <TableCell>{j.party_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{j.service_type_name ?? "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(j.completed_at)}</TableCell>
                        <TableCell className="text-right">{inr.format(j.invoiced_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="revenue-service" className="pt-4">
          <RevenueTable rows={revenueByService} emptyLabel="No invoiced revenue in this period." />
        </TabsContent>
        <TabsContent value="revenue-tag" className="pt-4">
          <RevenueTable rows={revenueByTag} emptyLabel="No invoiced revenue in this period." />
        </TabsContent>
        <TabsContent value="revenue-charge-type" className="pt-4">
          <RevenueTable rows={revenueByChargeType} emptyLabel="No invoiced charges in this period." />
        </TabsContent>
        <TabsContent value="marketing-sources" className="pt-4">
          <RevenueTable rows={revenueByMarketingSource} emptyLabel="No invoiced revenue in this period." />
        </TabsContent>

        <TabsContent value="customer-balances" className="flex flex-col gap-4 pt-4">
          <p className="text-xs text-muted-foreground">As of today -- outstanding balances aren't a date-range report.</p>
          {customerBalances.length === 0 ? (
            <EmptyRow label="No outstanding balances." />
          ) : (
            <>
              <StatRow>
                <StatTile label="Total outstanding" value={inr.format(customerBalances.reduce((sum, c) => sum + c.balance_amount, 0))} />
                <StatTile label="Customers" value={String(customerBalances.length)} />
              </StatRow>
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
            </>
          )}
        </TabsContent>

        <TabsContent value="aging" className="flex flex-col gap-4 pt-4">
          <p className="text-xs text-muted-foreground">As of today -- overdue standing isn't a date-range report.</p>
          {aging.length === 0 ? (
            <EmptyRow label="Nothing overdue." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {AGING_BUCKETS.map((bucket) => {
                  const rows = aging.filter((a) => a.aging_bucket === bucket);
                  const bucketTotal = rows.reduce((sum, a) => sum + a.balance_amount, 0);
                  return (
                    <div key={bucket} className="rounded-xl border border-border px-3 py-2.5">
                      <Badge variant={AGING_VARIANT[bucket]} className="text-xs">{bucket}</Badge>
                      <p className="mt-1.5 text-sm font-semibold">{inr.format(bucketTotal)}</p>
                      <p className="text-xs text-muted-foreground">{rows.length} invoice{rows.length === 1 ? "" : "s"}</p>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-lg border border-border">
                <ul className="divide-y md:hidden">
                  {aging.map((a) => (
                    <li key={a.document_id}>
                      <a href={invoiceHref(a.document_id)} className="flex flex-col gap-1 p-3 text-sm transition-colors hover:bg-muted/40">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <p className="min-w-0 break-words font-medium">{a.party_name}</p>
                          <p className="shrink-0 font-medium">{inr.format(a.balance_amount)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{a.number ?? "-"}</span>
                          <span>Due {formatDate(a.due_date)}</span>
                          <Badge variant={AGING_VARIANT[a.aging_bucket]}>{a.aging_bucket}</Badge>
                        </div>
                      </a>
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
                        <TableCell>
                          <a href={invoiceHref(a.document_id)} className="font-medium hover:underline">
                            {a.number ?? "View"}
                          </a>
                        </TableCell>
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
            </>
          )}
        </TabsContent>

        <TabsContent value="payments" className="flex flex-col gap-4 pt-4">
          {payments.length === 0 ? (
            <EmptyRow label="No payments recorded in this period." />
          ) : (
            <>
              <StatRow>
                <StatTile label="Total collected" value={inr.format(payments.reduce((sum, p) => sum + p.amount, 0))} />
                <StatTile label="Payments" value={String(payments.length)} />
              </StatRow>
              <div className="rounded-lg border border-border">
                <ul className="divide-y md:hidden">
                  {payments.map((p) => {
                    const content = (
                      <>
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <p className="min-w-0 break-words font-medium">{p.party_name}</p>
                          <p className="shrink-0 font-medium">{inr.format(p.amount)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatDate(p.payment_date)}</span>
                          <span>{p.method}</span>
                          {p.reference ? <span className="break-all">{p.reference}</span> : null}
                        </div>
                      </>
                    );
                    return (
                      <li key={p.id}>
                        {p.document_id ? (
                          <a href={invoiceHref(p.document_id)} className="flex flex-col gap-1 p-3 text-sm transition-colors hover:bg-muted/40">
                            {content}
                          </a>
                        ) : (
                          <div className="flex flex-col gap-1 p-3 text-sm">{content}</div>
                        )}
                      </li>
                    );
                  })}
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
                        <TableCell>
                          {p.document_id ? (
                            <a href={invoiceHref(p.document_id)} className="hover:underline">
                              {p.party_name}
                            </a>
                          ) : (
                            p.party_name
                          )}
                        </TableCell>
                        <TableCell>{p.method}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.reference ?? "-"}</TableCell>
                        <TableCell className="text-right">{inr.format(p.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="timecards" className="flex flex-col gap-4 pt-4">
          <p className="text-xs text-muted-foreground">{isDefaultRange ? "All time." : "For the selected date range."}</p>
          {timecards.length === 0 ? (
            <EmptyRow label="No time entries in this period." />
          ) : (
            <>
              <StatRow>
                <StatTile label="Total hours" value={String(timecards.reduce((sum, t) => sum + t.total_hours, 0).toFixed(1))} />
                <StatTile label="Billable hours" value={String(timecards.reduce((sum, t) => sum + t.billable_hours, 0).toFixed(1))} />
              </StatRow>
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
            </>
          )}
        </TabsContent>

        <TabsContent value="productivity" className="flex flex-col gap-4 pt-4">
          <p className="text-xs text-muted-foreground">{isDefaultRange ? "All time." : "For the selected date range."}</p>
          {productivity.length === 0 ? (
            <EmptyRow label="No activity in this period." />
          ) : (
            <>
              <StatRow>
                <StatTile label="Jobs completed" value={String(productivity.reduce((sum, p) => sum + p.jobs_completed, 0))} />
                <StatTile label="Hours logged" value={String(productivity.reduce((sum, p) => sum + p.total_hours, 0).toFixed(1))} />
              </StatRow>
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
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
