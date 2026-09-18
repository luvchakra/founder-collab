import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getGstLedgerSummary } from "@cofounderai/module-gst/lib/accounting/gst-ledger-queries";
import { explainGstGap, reconcileGst } from "@cofounderai/module-gst/lib/accounting/gst-ledger";
import { getPurchaseRegister, getSalesRegister } from "@cofounderai/module-gst/lib/filing/queries";
import { monthlyPeriodsForFiscalYear, fiscalYearOf } from "@cofounderai/module-gst/lib/accounting/periods";
import { GstLedgerView } from "@cofounderai/module-gst/components/accounting/gst-ledger-view";

const FISCAL_YEAR_START_MONTH = 4;

/**
 * Finance F7 — the GST ledger, reconciled against the return.
 *
 * Two independent paths to the same number: the return from `core.documents` (what gets
 * filed) and the ledger from `gst.journal_lines` (what the books say). Built from
 * different tables by different code on purpose — when they agree, the filed return is
 * backed by the books, and when they don't, something is being counted in one place and
 * not the other. Either way the founder needs to know before filing, not after.
 */
export default async function GstLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { businessSlug } = await params;
  const { period } = await searchParams;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const year = monthlyPeriodsForFiscalYear(fiscalYearOf(today, FISCAL_YEAR_START_MONTH), FISCAL_YEAR_START_MONTH);
  // `period` is user input from the URL: an unknown or empty value falls back to the
  // current month rather than reaching a query. (`period && find(...)` would yield "" for
  // an empty param, which `??` does not fall through — TypeScript caught that.)
  const selected =
    year.find((p) => p.gstPeriod === period) ??
    year.find((p) => p.startDate <= today && today <= p.endDate) ??
    year[0]!;

  const [ledger, sales, purchases] = await Promise.all([
    getGstLedgerSummary(businessId, selected.startDate, selected.endDate),
    getSalesRegister(businessId, selected.startDate, selected.endDate),
    getPurchaseRegister(businessId, selected.startDate, selected.endDate),
  ]);

  const reconciliation = reconcileGst(
    { output: ledger.output, input: ledger.input },
    { outputTax: sales.totalTax, inputTax: purchases.totalTax },
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="GST ledger"
        description={`Output tax, input credit and what you owe for ${selected.gstPeriod} — checked against the return before you file it.`}
      />
      <GstLedgerView
        output={ledger.output}
        input={ledger.input}
        netPayable={ledger.netPayable}
        reconciliation={reconciliation}
        causes={explainGstGap(reconciliation)}
        hasAccounts={ledger.hasAccounts}
      />
    </div>
  );
}
