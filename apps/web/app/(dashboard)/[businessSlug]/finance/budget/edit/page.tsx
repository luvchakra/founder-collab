import { notFound } from "next/navigation";
import { Target } from "lucide-react";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getBudgetGrid } from "@cofounderai/module-gst/lib/accounting/budget-queries";
import { BUDGET_PERMISSION } from "@cofounderai/module-gst/lib/accounting/budget-mutations";
import { fiscalYearLabel, fiscalYearOf, monthlyPeriodsForFiscalYear } from "@cofounderai/module-gst/lib/accounting/periods";
import { getActivationSettings } from "@cofounderai/module-gst/lib/activation/queries";
import { BudgetEntryForm } from "@cofounderai/module-gst/components/accounting/budget-entry-form";
import { saveBudgetAction } from "../actions";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

/** FIN-BUDGET-ENTRY — set the budget: one figure per income, cost and expense account
 * per month of a fiscal year (this year unless `?fy=` says otherwise). */
export default async function BudgetEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ fy?: string }>;
}) {
  const { businessSlug } = await params;
  const { fy } = await searchParams;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  if (!(await hasPermission(businessId, BUDGET_PERMISSION))) notFound();

  const { fiscalYearStartMonth } = await getActivationSettings(businessId);
  const current = fiscalYearOf(new Date().toISOString().slice(0, 10), fiscalYearStartMonth);
  const requested = Number(fy);
  // This year, last year and the next two: a budget is planned ahead, and looked back on.
  const options = [current - 1, current, current + 1, current + 2];
  const fiscalYear = options.includes(requested) ? requested : current;

  const year = monthlyPeriodsForFiscalYear(fiscalYear, fiscalYearStartMonth);
  const { accounts, amounts } = await getBudgetGrid(businessId, year[0]!.startDate, year[year.length - 1]!.startDate);
  const basePath = `/${businessSlug}/finance`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Set budget"
        description="A monthly figure for each account you want to track. Leave a month blank for no budget."
        breadcrumbs={[{ label: "Budget", href: `${basePath}/budget` }, { label: "Set budget" }]}
      />
      {accounts.length === 0 ? (
        <EmptyState
          icon={Target}
          message="Set up your chart of accounts first — a budget is set against income, cost of sales and expense accounts."
        />
      ) : (
        <BudgetEntryForm
          key={fiscalYear}
          fiscalYear={fiscalYear}
          fiscalYearOptions={options.map((value) => ({ value, label: fiscalYearLabel(value, fiscalYearStartMonth) }))}
          months={year.map((p) => ({ startDate: p.startDate, label: MONTH.format(new Date(`${p.startDate}T00:00:00Z`)) }))}
          accounts={accounts}
          amounts={amounts}
          action={saveBudgetAction.bind(null, businessId)}
        />
      )}
    </div>
  );
}
