import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listAlerts } from "@cofounderai/module-inventory/lib/alerts/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { AlertsList } from "@cofounderai/module-inventory/components/alerts/alerts-list";
import { updateAlertStatusAction } from "./actions";

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [alerts, canManage] = await Promise.all([
    listAlerts(businessId),
    hasPermission(businessId, "alerts.manage"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything that needs your attention today for {business.name}.
        </p>
      </div>

      <AlertsList alerts={alerts} canManage={canManage} updateStatusAction={updateAlertStatusAction.bind(null, businessId)} />
    </div>
  );
}
