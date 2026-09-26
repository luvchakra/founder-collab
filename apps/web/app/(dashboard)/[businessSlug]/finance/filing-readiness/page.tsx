import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getGstLedgerSummary } from "@cofounderai/module-gst/lib/accounting/gst-ledger-queries";
import { reconcileGst } from "@cofounderai/module-gst/lib/accounting/gst-ledger";
import { assessItc } from "@cofounderai/module-gst/lib/accounting/itc";
import { assessFilingReadiness } from "@cofounderai/module-gst/lib/accounting/filing-readiness";
import { getPurchaseRegister, getSalesRegister } from "@cofounderai/module-gst/lib/filing/queries";
import { getPurchaseReconciliation } from "@cofounderai/module-gst/lib/reconciliation/queries";
import { listUnpostedDocuments } from "@cofounderai/module-gst/lib/accounting/dashboard-queries";
import { listAccountingPeriods } from "@cofounderai/module-gst/lib/accounting/queries";
import { listBankAccounts, listBankTransactions } from "@cofounderai/module-gst/lib/accounting/banking-queries";
import { fiscalYearOf, monthlyPeriodsForFiscalYear, periodForDate } from "@cofounderai/module-gst/lib/accounting/periods";
import { getActivationSettings } from "@cofounderai/module-gst/lib/activation/queries";
import { FilingReadinessView } from "@cofounderai/module-gst/components/accounting/filing-readiness-view";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

/**
 * Finance F9 — the pre-flight check before filing.
 *
 * Draws every check from a different place on purpose: the ledger, the registers,
 * GSTR-2B, the bank, the period lock. A return can be arithmetically perfect and still
 * wrong for reasons none of those would catch alone.
 *
 * Answers a question and nothing more — it files nothing and marks nothing as filed.
 */
export default async function FilingReadinessPage({
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

  const { fiscalYearStartMonth } = await getActivationSettings(businessId);
  const today = new Date().toISOString().slice(0, 10);
  const year = monthlyPeriodsForFiscalYear(fiscalYearOf(today, fiscalYearStartMonth), fiscalYearStartMonth);
  const selected =
    year.find((p) => p.gstPeriod === period) ??
    year.find((p) => p.startDate <= today && today <= p.endDate) ??
    year[0]!;

  const [ledger, sales, purchases, twoB, unposted, periods, bankAccounts] = await Promise.all([
    getGstLedgerSummary(businessId, selected.startDate, selected.endDate),
    getSalesRegister(businessId, selected.startDate, selected.endDate),
    getPurchaseRegister(businessId, selected.startDate, selected.endDate),
    getPurchaseReconciliation(businessId, selected.gstPeriod),
    listUnpostedDocuments(businessId),
    listAccountingPeriods(businessId),
    listBankAccounts(businessId),
  ]);

  const reconciliation = reconcileGst(
    { output: ledger.output, input: ledger.input },
    { outputTax: sales.totalTax, inputTax: purchases.totalTax },
  );

  const itc = assessItc({
    ledger: ledger.input.total,
    register: purchases.totalTax,
    twoB: twoB ? twoB.rows.reduce((sum, row) => sum + (row.gstr2bTax ?? 0), 0) : 0,
    excludedNoGstin: twoB?.excludedNoGstinTaxableValue ?? 0,
    twoBAvailable: twoB !== null,
  });

  // Unmatched bank lines are counted only within the period being filed: a line from
  // three months ago is a real problem, but not this return's problem.
  const bankLines = await Promise.all(
    bankAccounts.map((account) => listBankTransactions(businessId, account.id)),
  );
  const unmatchedBankLines = bankLines
    .flat()
    .filter(
      (line) =>
        line.status === "unmatched" &&
        line.txn_date >= selected.startDate &&
        line.txn_date <= selected.endDate,
    ).length;

  const readiness = assessFilingReadiness({
    hasAccounts: ledger.hasAccounts,
    unpostedCount: unposted.filter(
      (d) => d.doc_date >= selected.startDate && d.doc_date <= selected.endDate,
    ).length,
    ledgerAgreesWithReturn: reconciliation.agrees,
    ledgerReturnGap: reconciliation.largestGap,
    itcAtRisk: itc.atRisk,
    twoBImported: twoB !== null,
    invalidGstinCount: sales.b2b.filter((row) => !row.gstin).length,
    unmatchedBankLines,
    periodStatus:
      periodForDate(periods, selected.endDate)?.status ?? null,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Filing readiness"
        description="Everything Finance knows about this period, asked as one question: is this safe to file?"
        actions={<ExportMenu exportId="finance.filing-readiness" businessSlug={businessSlug} params={{ period: selected.gstPeriod }} kind="report" />}
      />
      <FilingReadinessView readiness={readiness} period={selected.gstPeriod} />
    </div>
  );
}
