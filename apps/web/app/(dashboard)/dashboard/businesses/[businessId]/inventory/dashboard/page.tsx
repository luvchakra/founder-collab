import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { getDashboardSummary } from "@cofounderai/module-inventory/lib/dashboard/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { DashboardView } from "@cofounderai/module-inventory/components/dashboard/dashboard-view";

export default async function InventoryDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const canViewCost = await hasPermission(businessId, "inventory.view_cost");
  const data = await getDashboardSummary(businessId, canViewCost);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Operations dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name} - live across all warehouses.</p>
      </div>

      <DashboardView businessId={businessId} businessName={business.name} data={data} />
    </div>
  );
}
