import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listWarehouses } from "@cofounderai/module-inventory/lib/warehouses/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { WarehousesList } from "@cofounderai/module-inventory/components/warehouses/warehouses-list";
import { createWarehouseAction, updateWarehouseAction, toggleWarehouseActiveAction } from "./actions";

export default async function WarehousesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [warehouses, canEdit] = await Promise.all([
    listWarehouses(businessId),
    hasPermission(businessId, "inventory.edit"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Warehouses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Warehouses, stores and distribution centers for {business.name}.
        </p>
      </div>

      <WarehousesList
        warehouses={warehouses}
        canEdit={canEdit}
        createAction={createWarehouseAction.bind(null, businessId)}
        updateAction={updateWarehouseAction.bind(null, businessId)}
        toggleActiveAction={toggleWarehouseActiveAction.bind(null, businessId)}
      />
    </div>
  );
}
