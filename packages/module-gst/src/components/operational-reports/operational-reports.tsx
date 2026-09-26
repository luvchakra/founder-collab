import Link from "next/link";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { cn } from "@cofounderai/core/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import type {
  InventoryValuation,
  PurchaseByPartyRow,
  PurchaseSummary,
  SalesByItemRow,
  SalesByItemSplit,
  SalesByPartyRow,
} from "../../lib/operational-reports/derive";
import type { LedgerOperationalFigures } from "../../lib/operational-reports/queries";
import type { StatementLine } from "../../lib/accounting/reports";
import { ledgerAmount } from "../accounting/labels";

export type OperationalReportKey = "sales" | "purchases" | "expenses" | "inventory" | "margin";

export const OPERATIONAL_REPORT_LABEL: Record<OperationalReportKey, string> = {
  sales: "Sales",
  purchases: "Purchases",
  expenses: "Expenses",
  inventory: "Inventory valuation",
  margin: "COGS & gross margin",
};

export function isOperationalReportKey(value: string): value is OperationalReportKey {
  return value in OPERATIONAL_REPORT_LABEL;
}

/** FIN-6: the report switcher — links, not client state, so a report is shareable as read. */
export function OperationalReportTabs({ active, hrefFor }: { active: OperationalReportKey; hrefFor: (key: OperationalReportKey) => string }) {
  return (
    <nav aria-label="Report" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
      {(Object.keys(OPERATIONAL_REPORT_LABEL) as OperationalReportKey[]).map((key) => (
        <Link
          key={key}
          href={hrefFor(key)}
          aria-current={key === active ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            key === active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {OPERATIONAL_REPORT_LABEL[key]}
        </Link>
      ))}
    </nav>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}

type Column<T> = { header: string; className?: string; cell: (row: T) => ReactNode; total?: ReactNode };

/** One table shape for every report here: name on the left, figures right-aligned, an
 * optional total row. Below `md` each row stacks as name over its main figure. */
function ReportTable<T>({
  rows,
  rowKey,
  name,
  columns,
  mobileValue,
  totalLabel,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  name: { header: string; cell: (row: T) => ReactNode };
  columns: Column<T>[];
  mobileValue: (row: T) => ReactNode;
  totalLabel?: string;
}) {
  const hasTotal = columns.some((c) => c.total !== undefined);
  return (
    <div className="rounded-2xl border border-border">
      <ul className="divide-y md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0 break-words">{name.cell(row)}</span>
            <span className="shrink-0 tabular-nums">{mobileValue(row)}</span>
          </li>
        ))}
      </ul>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>{name.header}</TableHead>
            {columns.map((c) => (
              <TableHead key={c.header} className={cn("text-right", c.className)}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              <TableCell>{name.cell(row)}</TableCell>
              {columns.map((c) => (
                <TableCell key={c.header} className="text-right tabular-nums">{c.cell(row)}</TableCell>
              ))}
            </TableRow>
          ))}
          {hasTotal ? (
            <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
              <TableCell>{totalLabel ?? "Total"}</TableCell>
              {columns.map((c) => (
                <TableCell key={c.header} className="text-right tabular-nums">{c.total ?? ""}</TableCell>
              ))}
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

const money = (n: number) => ledgerAmount.format(n);
const sum = <T,>(rows: T[], f: (r: T) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) * 100) / 100;

function ItemTable({ rows }: { rows: SalesByItemRow[] }) {
  return (
    <ReportTable
      rows={rows}
      rowKey={(r) => r.itemId ?? "unitemised"}
      name={{ header: "Item", cell: (r) => (<>{r.itemName}{r.sku ? <span className="ml-2 text-xs text-muted-foreground">{r.sku}</span> : null}</>) }}
      columns={[
        { header: "Quantity", className: "w-28", cell: (r) => (r.quantity === null ? "—" : r.quantity.toLocaleString("en-IN")) },
        { header: "Sales", className: "w-40", cell: (r) => money(r.salesValue), total: money(sum(rows, (r) => r.salesValue)) },
      ]}
      mobileValue={(r) => money(r.salesValue)}
    />
  );
}

/** Sales by customer, by product and by service. */
export function SalesReport({ byParty, byItem, customerHref }: { byParty: SalesByPartyRow[]; byItem: SalesByItemSplit; customerHref?: (partyId: string) => string }) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="By customer" description="Net of credit notes and returns. Taxable value is before GST.">
        {byParty.length === 0 ? (
          <Empty>No sales in this period.</Empty>
        ) : (
          <ReportTable
            rows={byParty}
            rowKey={(r) => r.partyId}
            name={{ header: "Customer", cell: (r) => (customerHref ? <Link href={customerHref(r.partyId)} className="hover:underline">{r.partyName}</Link> : r.partyName) }}
            columns={[
              { header: "Invoices", className: "w-24", cell: (r) => r.documentCount, total: sum(byParty, (r) => r.documentCount) },
              { header: "Taxable value", className: "w-40", cell: (r) => money(r.taxableValue), total: money(sum(byParty, (r) => r.taxableValue)) },
              { header: "GST", className: "w-32", cell: (r) => money(r.tax), total: money(sum(byParty, (r) => r.tax)) },
              { header: "Total", className: "w-40", cell: (r) => money(r.total), total: money(sum(byParty, (r) => r.total)) },
            ]}
            mobileValue={(r) => money(r.taxableValue)}
          />
        )}
      </Section>

      <Section title="By product" description="Goods and parts sold, at the price on each invoice line.">
        {byItem.products.length === 0 ? <Empty>No products sold in this period.</Empty> : <ItemTable rows={byItem.products} />}
      </Section>

      <Section title="By service" description="Services and labour sold, at the price on each invoice line.">
        {byItem.services.length === 0 ? <Empty>No services sold in this period.</Empty> : <ItemTable rows={byItem.services} />}
      </Section>

      {byItem.other.length > 0 ? (
        <Section title="Other items">
          <ItemTable rows={byItem.other} />
        </Section>
      ) : null}

      {byItem.unitemised !== 0 ? (
        <Notice>
          {money(byItem.unitemised)} of sales is on invoices entered without lines, so it can&apos;t be put against a product or
          service. Document-level discounts and shipping aren&apos;t spread across lines either, which is why the item totals
          can differ from the customer total.
        </Notice>
      ) : null}
    </div>
  );
}

function PartyTable({ rows, totals }: { rows: PurchaseByPartyRow[]; totals: PurchaseSummary["totalBills"] }) {
  return (
    <ReportTable
      rows={rows}
      rowKey={(r) => `${r.partyId}-${r.kind}`}
      name={{ header: "Supplier", cell: (r) => r.partyName }}
      columns={[
        { header: "Documents", className: "w-24", cell: (r) => r.documentCount, total: sum(rows, (r) => r.documentCount) },
        { header: "Taxable value", className: "w-40", cell: (r) => money(r.taxableValue), total: money(totals.taxable) },
        { header: "GST", className: "w-32", cell: (r) => money(r.tax), total: money(totals.tax) },
        { header: "Total", className: "w-40", cell: (r) => money(r.total), total: money(totals.total) },
      ]}
      mobileValue={(r) => money(r.total)}
    />
  );
}

/** Purchase summary: supplier bills (net of supplier credits) by supplier. */
export function PurchasesReport({ summary }: { summary: PurchaseSummary }) {
  return (
    <Section title="Bills by supplier" description="Supplier bills in the period, net of supplier credits.">
      {summary.bills.length === 0 ? <Empty>No bills in this period.</Empty> : <PartyTable rows={summary.bills} totals={summary.totalBills} />}
    </Section>
  );
}

/** Expense summary: by category (the ledger's expense accounts) and by payee. */
export function ExpensesReport({ byCategory, summary, accountHref }: { byCategory: StatementLine[]; summary: PurchaseSummary; accountHref: (accountId: string) => string }) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="By category" description="Every expense account, from the ledger — the same figures as the profit and loss.">
        {byCategory.length === 0 ? (
          <Empty>No expenses posted in this period.</Empty>
        ) : (
          <ReportTable
            rows={byCategory}
            rowKey={(r) => r.accountId}
            name={{ header: "Account", cell: (r) => (<Link href={accountHref(r.accountId)} className="hover:underline"><span className="text-muted-foreground tabular-nums">{r.accountNumber}</span> {r.name}</Link>) }}
            columns={[{ header: "Amount", className: "w-40", cell: (r) => money(r.amount), total: money(sum(byCategory, (r) => r.amount)) }]}
            mobileValue={(r) => money(r.amount)}
          />
        )}
      </Section>
      <Section title="By payee" description="Expenses entered in Finance, by who was paid.">
        {summary.expenses.length === 0 ? <Empty>No expenses entered in this period.</Empty> : <PartyTable rows={summary.expenses} totals={summary.totalExpenses} />}
      </Section>
    </div>
  );
}

/** Inventory valuation at cost, with oversold (negative) positions set beside the total. */
export function InventoryReport({ valuation }: { valuation: InventoryValuation }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4 rounded-2xl border border-border bg-primary/5 px-4 py-3 text-base font-semibold">
        <span>Stock on hand at cost</span>
        <span className="tabular-nums">{money(valuation.totalValue)}</span>
      </div>
      {valuation.negativeCount > 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-subtle">
          {valuation.negativeCount} item{valuation.negativeCount === 1 ? " shows" : "s show"} negative stock — more sold than was
          ever received ({money(valuation.negativeValue)} at cost). Those are left out of the total rather than netted against real
          stock; record the missing receipts in Inventory to correct them.
        </p>
      ) : null}
      {valuation.uncostedCount > 0 ? (
        <Notice>
          {valuation.uncostedCount} item{valuation.uncostedCount === 1 ? " has" : "s have"} no cost price, so {valuation.uncostedCount === 1 ? "it counts" : "they count"} as
          zero here.
        </Notice>
      ) : null}
      {valuation.rows.length === 0 ? (
        <Empty>No stock on hand.</Empty>
      ) : (
        <ReportTable
          rows={valuation.rows}
          rowKey={(r) => r.itemId}
          name={{ header: "Item", cell: (r) => (<>{r.name}{r.sku ? <span className="ml-2 text-xs text-muted-foreground">{r.sku}</span> : null}{r.negative ? <Badge variant="warning" className="ml-2">Negative</Badge> : null}</>) }}
          columns={[
            { header: "On hand", className: "w-28", cell: (r) => r.quantity.toLocaleString("en-IN") },
            { header: "Unit cost", className: "w-32", cell: (r) => money(r.unitCost) },
            { header: "Value", className: "w-40", cell: (r) => (r.negative ? "—" : money(r.value)), total: money(valuation.totalValue) },
          ]}
          mobileValue={(r) => (r.negative ? "Negative" : money(r.value))}
        />
      )}
    </div>
  );
}

/** COGS by account and gross margin, from the ledger. */
export function MarginReport({ figures, accountHref }: { figures: LedgerOperationalFigures; accountHref: (accountId: string) => string }) {
  const { margin } = figures;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Revenue", money(margin.revenue)],
          ["Cost of goods sold", money(margin.cogs)],
          ["Gross profit", money(margin.grossProfit)],
          ["Gross margin", margin.marginPercent === null ? "—" : `${margin.marginPercent}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <Section title="Cost of goods sold" description="By account, from the ledger — the same figures as the profit and loss.">
        {figures.cogs.length === 0 ? (
          <Empty>No cost of sales posted in this period.</Empty>
        ) : (
          <ReportTable
            rows={figures.cogs}
            rowKey={(r) => r.accountId}
            name={{ header: "Account", cell: (r) => (<Link href={accountHref(r.accountId)} className="hover:underline"><span className="text-muted-foreground tabular-nums">{r.accountNumber}</span> {r.name}</Link>) }}
            columns={[{ header: "Amount", className: "w-40", cell: (r) => money(r.amount), total: money(margin.cogs) }]}
            mobileValue={(r) => money(r.amount)}
          />
        )}
      </Section>
    </div>
  );
}
