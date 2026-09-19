import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getBudgetVsActual } from "@cofounderai/module-gst/lib/accounting/budget-queries";
import { fiscalYearLabel, fiscalYearOf, monthlyPeriodsForFiscalYear } from "@cofounderai/module-gst/lib/accounting/periods";
import { getActivationSettings } from "@cofounderai/module-gst/lib/activation/queries";
import { BudgetView } from "@cofounderai/module-gst/components/accounting/budget-view";

/** Finance F10 — budget against actual, year to date. */
export default async function BudgetPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const { fiscalYearStartMonth } = await getActivationSettings(businessId);
  const today = new Date().toISOString().slice(0, 10);
  const fiscalYear = fiscalYearOf(today, fiscalYearStartMonth);
  const year = monthlyPeriodsForFiscalYear(fiscalYear, fiscalYearStartMonth);
  const thisMonth = year.find((p) => p.startDate <= today && today <= p.endDate) ?? year[0]!;

  const summary = await getBudgetVsActual(businessId, year[0]!.startDate, thisMonth.endDate);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Budget"
        description={`What you planned against what happened, ${fiscalYearLabel(fiscalYear, fiscalYearStartMonth)} to date.`}
      />
      <BudgetView summary={summary} basePath={`/${businessSlug}/finance`} />
    </div>
  );
}
