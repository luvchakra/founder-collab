import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listWarehouses } from "@cofounderai/module-inventory/lib/warehouses/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { WarehousesList } from "@cofounderai/module-inventory/components/warehouses/warehouses-list";
import { createWarehouseAction, updateWarehouseAction, toggleWarehouseActiveAction } from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function WarehousesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [warehouses, canEdit] = await Promise.all([
    listWarehouses(businessId),
    hasPermission(businessId, "inventory.edit"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Warehouses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Warehouses, stores and distribution centers for {business.name}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="inventory.warehouses" businessSlug={businessSlug} />
        </div>
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
