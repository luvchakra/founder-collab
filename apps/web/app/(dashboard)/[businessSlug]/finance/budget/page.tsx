import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@cofounderai/core/ui/button";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { BUDGET_PERMISSION } from "@cofounderai/module-gst/lib/accounting/budget-mutations";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getBudgetVsActual } from "@cofounderai/module-gst/lib/accounting/budget-queries";
import { fiscalYearLabel, fiscalYearOf, monthlyPeriodsForFiscalYear } from "@cofounderai/module-gst/lib/accounting/periods";
import { getActivationSettings } from "@cofounderai/module-gst/lib/activation/queries";
import { BudgetView } from "@cofounderai/module-gst/components/accounting/budget-view";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

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

  const [summary, canSet] = await Promise.all([
    getBudgetVsActual(businessId, year[0]!.startDate, thisMonth.endDate),
    hasPermission(businessId, BUDGET_PERMISSION),
  ]);
  // FIN-BUDGET-ENTRY: the screen that sets the figures this report compares against.
  const setBudgetHref = canSet ? `/${businessSlug}/finance/budget/edit` : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Budget"
        description={`What you planned against what happened, ${fiscalYearLabel(fiscalYear, fiscalYearStartMonth)} to date.`}
        actions={
          <>
            <ExportMenu exportId="finance.budget" businessSlug={businessSlug} kind="report" />
            {setBudgetHref ? (
              <Button asChild size="sm">
                <Link href={setBudgetHref}>Set budget</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <BudgetView summary={summary} />
    </div>
  );
}
