import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { cn } from "@cofounderai/core/lib/utils";
import { getFiscalContext, isIsoDate } from "@cofounderai/module-gst/exports/periods";
import { fiscalYearLabel, monthlyPeriodsForFiscalYear } from "@cofounderai/module-gst/lib/accounting/periods";
import {
  getInventoryValuation,
  getLedgerOperationalFigures,
  getPurchaseSummary,
  getSalesByItem,
  getSalesByParty,
} from "@cofounderai/module-gst/lib/operational-reports/queries";
import {
  ExpensesReport,
  InventoryReport,
  MarginReport,
  OperationalReportTabs,
  PurchasesReport,
  SalesReport,
  isOperationalReportKey,
  type OperationalReportKey,
} from "@cofounderai/module-gst/components/operational-reports/operational-reports";
import { ReportPeriodCaption } from "@cofounderai/module-gst/components/accounting/financial-statements";

/**
 * FIN-6 — operational reports (§28): sales by customer/product/service, purchase and
 * expense summaries, inventory valuation, COGS and gross margin.
 *
 * Only the selected report is read. Inventory valuation comes through module-inventory's
 * contract and degrades to a plain sentence when Inventory isn't licensed (ADR-10) — the
 * rest of the page never depends on it.
 */
export default async function FinanceOperationalReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ report?: string; from?: string; to?: string }>;
}) {
  const { businessSlug } = await params;
  const { report: reportParam, from: fromParam, to: toParam } = await searchParams;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const report: OperationalReportKey = reportParam && isOperationalReportKey(reportParam) ? reportParam : "sales";
  const { fiscalYear, fiscalYearStartMonth, year, thisMonth, label } = await getFiscalContext(businessId);
  const from = isIsoDate(fromParam) ? fromParam : year[0]!.startDate;
  const to = isIsoDate(toParam) ? toParam : thisMonth.endDate;

  const basePath = `/${businessSlug}/finance`;
  const href = (next: { report?: OperationalReportKey; from?: string; to?: string }) =>
    `${basePath}/operational-reports?report=${next.report ?? report}&from=${next.from ?? from}&to=${next.to ?? to}`;
  const accountHref = (accountId: string) => `${basePath}/accounts/${accountId}?from=${from}&to=${to}`;
  const lastYear = monthlyPeriodsForFiscalYear(fiscalYear - 1, fiscalYearStartMonth);
  const presets = [
    { label: "This month", from: thisMonth.startDate, to: thisMonth.endDate },
    { label: `${label} to date`, from: year[0]!.startDate, to: thisMonth.endDate },
    { label: fiscalYearLabel(fiscalYear - 1, fiscalYearStartMonth), from: lastYear[0]!.startDate, to: lastYear[11]!.endDate },
  ];

  let body: React.ReactNode;
  if (report === "sales") {
    const [byParty, byItem] = await Promise.all([getSalesByParty(businessId, from, to), getSalesByItem(businessId, from, to)]);
    body = <SalesReport byParty={byParty} byItem={byItem} />;
  } else if (report === "purchases") {
    body = <PurchasesReport summary={await getPurchaseSummary(businessId, from, to)} />;
  } else if (report === "expenses") {
    const [figures, summary] = await Promise.all([getLedgerOperationalFigures(businessId, from, to), getPurchaseSummary(businessId, from, to)]);
    body = <ExpensesReport byCategory={figures.expensesByCategory} summary={summary} accountHref={accountHref} />;
  } else if (report === "inventory") {
    const result = await getInventoryValuation(businessId);
    body = result.available ? (
      <InventoryReport valuation={result.valuation} />
    ) : (
      <p className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">{result.message}</p>
    );
  } else {
    body = <MarginReport figures={await getLedgerOperationalFigures(businessId, from, to)} accountHref={accountHref} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Operational reports"
        description="Who you sell to and what, what you buy and spend, what your stock is worth, and what you keep after the cost of sales."
      />
      <div className="flex flex-col gap-3">
        <OperationalReportTabs active={report} hrefFor={(key) => href({ report: key })} />
        {report === "inventory" ? (
          <p className="text-sm text-muted-foreground">Stock on hand today, at each item&apos;s current cost price.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((preset) => {
              const current = preset.from === from && preset.to === to;
              return (
                <Link
                  key={preset.label}
                  href={href({ from: preset.from, to: preset.to })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    current ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset.label}
                </Link>
              );
            })}
            <ReportPeriodCaption from={from} to={to} />
          </div>
        )}
      </div>
      {body}
    </div>
  );
}
