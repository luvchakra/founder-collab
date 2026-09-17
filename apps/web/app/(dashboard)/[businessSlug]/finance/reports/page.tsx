import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { cn } from "@cofounderai/core/lib/utils";
import { getFinancialStatements } from "@cofounderai/module-gst/lib/accounting/report-queries";
import { fiscalYearLabel, fiscalYearOf, monthlyPeriodsForFiscalYear } from "@cofounderai/module-gst/lib/accounting/periods";
import {
  BalanceSheetReport,
  ProfitAndLossReport,
  ReportPeriodCaption,
  ReportTabs,
  TrialBalanceReport,
  isReportKey,
  type ReportKey,
} from "@cofounderai/module-gst/components/accounting/financial-statements";

const FISCAL_YEAR_START_MONTH = 4;

/**
 * Finance — the three statements, all from one read of the ledger.
 *
 * Which report and which period are both in the URL rather than in client state: a
 * financial report is something people send each other, and a link that opens on a
 * different period than the one the sender was reading is worse than no link.
 */
export default async function FinanceReportsPage({
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

  const report: ReportKey = reportParam && isReportKey(reportParam) ? reportParam : "profit-and-loss";

  const today = new Date().toISOString().slice(0, 10);
  const fiscalYear = fiscalYearOf(today, FISCAL_YEAR_START_MONTH);
  const year = monthlyPeriodsForFiscalYear(fiscalYear, FISCAL_YEAR_START_MONTH);
  const thisMonth = year.find((p) => p.startDate <= today && today <= p.endDate) ?? year[0]!;

  // Year to date by default: the period someone means when they say "how are we doing".
  const from = isIsoDate(fromParam) ? fromParam : year[0]!.startDate;
  const to = isIsoDate(toParam) ? toParam : thisMonth.endDate;

  const statements = await getFinancialStatements(businessId, { from, to });
  const basePath = `/${businessSlug}/finance/reports`;
  const href = (next: { report?: ReportKey; from?: string; to?: string }) =>
    `${basePath}?report=${next.report ?? report}&from=${next.from ?? from}&to=${next.to ?? to}`;

  const presets: { label: string; from: string; to: string }[] = [
    { label: "This month", from: thisMonth.startDate, to: thisMonth.endDate },
    { label: `${fiscalYearLabel(fiscalYear, FISCAL_YEAR_START_MONTH)} to date`, from: year[0]!.startDate, to: thisMonth.endDate },
    { label: fiscalYearLabel(fiscalYear - 1, FISCAL_YEAR_START_MONTH), from: monthlyPeriodsForFiscalYear(fiscalYear - 1, FISCAL_YEAR_START_MONTH)[0]!.startDate, to: monthlyPeriodsForFiscalYear(fiscalYear - 1, FISCAL_YEAR_START_MONTH)[11]!.endDate },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financial reports"
        description="Your profit and loss, balance sheet and trial balance, straight from the ledger."
      />

      <div className="flex flex-col gap-3">
        <ReportTabs active={report} hrefFor={(key) => href({ report: key })} />
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((preset) => {
            const current = preset.from === from && preset.to === to;
            return (
              <Link
                key={preset.label}
                href={href({ from: preset.from, to: preset.to })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  current
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {preset.label}
              </Link>
            );
          })}
          <ReportPeriodCaption from={from} to={to} />
        </div>
      </div>

      {!statements.hasActivity ? (
        <EmptyState
          icon={BarChart3}
          message="Nothing has been posted in this period yet. Once invoices, bills and payments start landing in the ledger, these reports fill in on their own."
        />
      ) : report === "trial-balance" ? (
        <TrialBalanceReport report={statements.trialBalance} />
      ) : report === "balance-sheet" ? (
        <BalanceSheetReport report={statements.balanceSheet} />
      ) : (
        <ProfitAndLossReport report={statements.profitAndLoss} />
      )}
    </div>
  );
}

/** A date from the URL is user input: anything that isn't a plain ISO date falls back to
 * the default period rather than reaching the query. */
function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
