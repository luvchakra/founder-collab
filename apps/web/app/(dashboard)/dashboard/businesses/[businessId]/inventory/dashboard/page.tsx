import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { getDashboardSummary } from "@cofounderai/module-inventory/lib/dashboard/queries";
import { listWarehouses } from "@cofounderai/module-inventory/lib/warehouses/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { DashboardView } from "@cofounderai/module-inventory/components/dashboard/dashboard-view";

export default async function InventoryDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ warehouse?: string }>;
}) {
  const { businessId } = await params;
  const { warehouse: warehouseFilter } = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [canViewCost, warehouses] = await Promise.all([
    hasPermission(businessId, "inventory.view_cost"),
    listWarehouses(businessId),
  ]);
  const warehouseNameById = new Map(warehouses.map((w) => [w.id, w.name]));
  // A stale/foreign warehouse id in the URL is treated the same as no filter, not an error.
  const selectedWarehouseId = warehouseFilter && warehouseNameById.has(warehouseFilter) ? warehouseFilter : undefined;
  const data = await getDashboardSummary(businessId, canViewCost, selectedWarehouseId, warehouseNameById);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Operations dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {business.name}
          {selectedWarehouseId ? ` - ${warehouseNameById.get(selectedWarehouseId)}` : " - live across all warehouses"}.
        </p>
      </div>

      <DashboardView
        businessId={businessId}
        businessName={business.name}
        data={data}
        warehouses={warehouses}
        selectedWarehouseId={selectedWarehouseId}
      />
    </div>
  );
}
