import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listAccountingPeriods } from "@cofounderai/module-gst/lib/accounting/queries";
import { fiscalYearOf } from "@cofounderai/module-gst/lib/accounting/periods";
import { AccountingPeriodsView } from "@cofounderai/module-gst/components/accounting/accounting-periods-view";
import { openFiscalYearAction, setAccountingPeriodStatusAction } from "./actions";

/** India's fiscal year, this module's home jurisdiction. Held here rather than in the
 * domain layer (which takes it as a parameter) until a business can choose its own. */
const FISCAL_YEAR_START_MONTH = 4;

/**
 * Finance F2 — the accounting calendar: which months accept postings, which are locked
 * while they're reconciled, and which have been filed.
 *
 * Offers the current fiscal year and its neighbours to open, rather than a free-form
 * year picker: opening FY 1998 by typo creates twelve periods someone then has to work
 * out how to remove.
 */
export default async function FinancePeriodsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [periods, canManage] = await Promise.all([
    listAccountingPeriods(businessId),
    hasPermission(businessId, "gst.periods.manage"),
  ]);

  const currentFiscalYear = fiscalYearOf(new Date().toISOString().slice(0, 10), FISCAL_YEAR_START_MONTH);
  const openedYears = new Set(periods.map((p) => p.fiscal_year));
  const openableFiscalYears = [currentFiscalYear + 1, currentFiscalYear, currentFiscalYear - 1].filter(
    (year) => !openedYears.has(year),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounting periods"
        description="The months your books are kept and closed against. Locking a period stops new entries landing in it while you reconcile; a filed period stays as filed, and corrections go into an open one."
      />

      <AccountingPeriodsView
        periods={periods}
        openableFiscalYears={openableFiscalYears}
        fiscalYearStartMonth={FISCAL_YEAR_START_MONTH}
        canManage={canManage}
        openFiscalYearAction={openFiscalYearAction.bind(null, businessId)}
        setStatusAction={setAccountingPeriodStatusAction.bind(null, businessId)}
      />
    </div>
  );
}
