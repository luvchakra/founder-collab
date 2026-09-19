import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getActivationSummary } from "@cofounderai/module-gst/lib/activation/queries";
import { ActivationChecklist } from "@cofounderai/module-gst/components/activation/activation-checklist";
import { ActivationSettingsForm } from "@cofounderai/module-gst/components/activation/activation-settings-form";
import { ActivateButton } from "@cofounderai/module-gst/components/activation/activate-button";
import { businessPath } from "@/lib/business-path";
import { activateFinanceAction, setAccountingMethodAction, setFiscalYearStartMonthAction } from "./actions";

/**
 * FIN-3 (Activation Wizard, §42) -- the ten first-run steps as one checklist rather than a
 * ten-page click-through: five of them (chart of accounts, GST profile, account mappings,
 * opening balances, bank accounts) already have their own screens, and a founder who just
 * wants to see what's left and jump straight to it is better served by a status list with
 * links than by being walked through pages that mostly say "already done, next."
 *
 * Never gates any other Finance screen -- everything above and below this page keeps
 * working whether or not it's ever visited (ADR-10). This is a guided setup summary plus
 * the one action (Activate) that runs FIN-2's backfill, not an access checkpoint.
 */
export default async function FinanceActivatePage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [summary, canManage, base] = await Promise.all([
    getActivationSummary(businessId),
    hasPermission(businessId, "gst.activation.manage"),
    businessPath(businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activate Finance"
        description={`Set up ${summary.businessName}'s books, one step at a time -- or skip ahead to whatever's left.`}
      />

      <ActivationChecklist steps={summary.steps} basePath={`${base}/finance`} />

      <ActivationSettingsForm
        accountingMethod={summary.settings.accountingMethod}
        fiscalYearStartMonth={summary.settings.fiscalYearStartMonth}
        canManage={canManage}
        setAccountingMethodAction={setAccountingMethodAction.bind(null, businessId)}
        setFiscalYearStartMonthAction={setFiscalYearStartMonthAction.bind(null, businessId)}
      />

      <ActivateButton activatedAt={summary.activation.activatedAt} canActivate={canManage} activateAction={activateFinanceAction.bind(null, businessId)} />
    </div>
  );
}
