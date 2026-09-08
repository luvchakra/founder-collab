"use client";

import { Badge } from "@cofounderai/core/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cofounderai/core/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
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
  return <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">{label}</p>;
}

function RevenueTable({ rows, emptyLabel }: { rows: RevenueByGroupRow[] | MarketingSourceRevenueRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <EmptyRow label={emptyLabel} />;
  return (
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
            <TableCell>{r.label}</TableCell>
            <TableCell className="text-right font-medium">{inr.format(r.revenue)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
      <TabsList className="flex-wrap">
        <TabsTrigger value="jobs-completed">Jobs completed</TabsTrigger>
        <TabsTrigger value="revenue-service">Revenue by service</TabsTrigger>
        <TabsTrigger value="revenue-tag">Revenue by tag</TabsTrigger>
        <TabsTrigger value="revenue-charge-type">Revenue by charge type</TabsTrigger>
        <TabsTrigger value="marketing-sources">Marketing sources</TabsTrigger>
        <TabsTrigger value="customer-balances">Customer balances</TabsTrigger>
        <TabsTrigger value="aging">Account aging</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="timecards">Timecards</TabsTrigger>
        <TabsTrigger value="productivity">Productivity</TabsTrigger>
      </TabsList>

      <TabsContent value="jobs-completed">
        {jobsCompleted.length === 0 ? (
          <EmptyRow label="No completed jobs yet." />
        ) : (
          <Table>
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
                  <TableCell>{c.party_name}</TableCell>
                  <TableCell className="text-right font-medium">{inr.format(c.balance_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>

      <TabsContent value="aging">
        {aging.length === 0 ? (
          <EmptyRow label="Nothing overdue." />
        ) : (
          <Table>
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
        )}
      </TabsContent>

      <TabsContent value="payments">
        {payments.length === 0 ? (
          <EmptyRow label="No payments recorded yet." />
        ) : (
          <Table>
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
        )}
      </TabsContent>

      <TabsContent value="timecards">
        <p className="mb-3 text-xs text-muted-foreground">This calendar month.</p>
        {timecards.length === 0 ? (
          <EmptyRow label="No time entries this month." />
        ) : (
          <Table>
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
        )}
      </TabsContent>

      <TabsContent value="productivity">
        <p className="mb-3 text-xs text-muted-foreground">This calendar month.</p>
        {productivity.length === 0 ? (
          <EmptyRow label="No activity this month." />
        ) : (
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
                  <TableCell>{p.employee_name}</TableCell>
                  <TableCell className="text-right">{p.jobs_completed}</TableCell>
                  <TableCell className="text-right">{p.total_hours}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>
    </Tabs>
  );
}
