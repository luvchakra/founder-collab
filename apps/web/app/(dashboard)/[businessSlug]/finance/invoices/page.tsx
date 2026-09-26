import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { StatCard } from "@cofounderai/core/ui/stat-card";
import { cn } from "@cofounderai/core/lib/utils";
import { getFiscalContext, isIsoDate } from "@cofounderai/module-gst/exports/periods";
import { INVOICE_LIST_LIMIT, listFinanceInvoices } from "@cofounderai/module-gst/lib/invoices/queries";
import { countNeedingAttention, filterInvoices } from "@cofounderai/module-gst/lib/invoices/derive";
import { fiscalYearLabel, monthlyPeriodsForFiscalYear } from "@cofounderai/module-gst/lib/accounting/periods";
import { FinanceInvoicesView } from "@cofounderai/module-gst/components/invoices/finance-invoices-view";
import { ReportPeriodCaption } from "@cofounderai/module-gst/components/accounting/financial-statements";

/**
 * FIN-4 — the Finance invoice view (§18): every issued invoice, whichever module raised
 * it, read from `core.documents` (never a second invoice master), with its accounting,
 * payment, GST and e-invoice status kept as four independent columns.
 *
 * Period and filter live in the URL, like the reports: this is a list people send each
 * other ("these are the ones not in a return yet").
 */
export default async function FinanceInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string; status?: string }>;
}) {
  const { businessSlug } = await params;
  const { from: fromParam, to: toParam, status } = await searchParams;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const { fiscalYear, fiscalYearStartMonth, year, thisMonth, label } = await getFiscalContext(businessId);
  const from = isIsoDate(fromParam) ? fromParam : year[0]!.startDate;
  const to = isIsoDate(toParam) ? toParam : thisMonth.endDate;

  const { invoices, truncated } = await listFinanceInvoices(businessId, from, to);
  const counts = countNeedingAttention(invoices);
  const shown = filterInvoices(invoices, status);

  const basePath = `/${businessSlug}/finance`;
  const href = (next: { from?: string; to?: string; status?: string | null }) => {
    const query = new URLSearchParams({ from: next.from ?? from, to: next.to ?? to });
    const s = next.status === undefined ? status : next.status;
    if (s) query.set("status", s);
    return `${basePath}/invoices?${query.toString()}`;
  };
  const lastYear = monthlyPeriodsForFiscalYear(fiscalYear - 1, fiscalYearStartMonth);
  const presets = [
    { label: "This month", from: thisMonth.startDate, to: thisMonth.endDate },
    { label: `${label} to date`, from: year[0]!.startDate, to: thisMonth.endDate },
    { label: fiscalYearLabel(fiscalYear - 1, fiscalYearStartMonth), from: lastYear[0]!.startDate, to: lastYear[11]!.endDate },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoices"
        description="Every invoice you've issued, from any module, with where it stands in the books, with the customer, with GST and with e-invoicing."
      />

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

      {/* One tile per status dimension; each filters the list to what needs attention there. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Not posted" value={counts.notPosted} tone={counts.notPosted > 0 ? "warning" : "success"} href={href({ status: "accounting:not_posted" })} />
        <StatCard label="Awaiting payment" value={counts.unpaid} tone={counts.unpaid > 0 ? "warning" : "success"} href={href({ status: "payment:unpaid" })} />
        <StatCard label="Not in a GST return" value={counts.notReported} tone={counts.notReported > 0 ? "warning" : "success"} href={href({ status: "gst:not_in_return" })} />
        <StatCard label="E-invoice failed" value={counts.einvoiceFailed} tone={counts.einvoiceFailed > 0 ? "destructive" : "success"} href={href({ status: "einvoice:failed" })} />
      </div>

      {status && shown.length !== invoices.length ? (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {invoices.length} invoices.{" "}
          <Link href={href({ status: null })} className="text-primary hover:underline">
            Show all
          </Link>
        </p>
      ) : null}

      {truncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-subtle">
          Only the latest {INVOICE_LIST_LIMIT} invoices in this period are listed — narrow the dates to see the rest.
        </p>
      ) : null}

      <FinanceInvoicesView invoices={shown} documentPath={`${basePath}/documents`} />
    </div>
  );
}
