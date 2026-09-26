import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import {
  listStockLevels,
  listActiveProductOptions,
  listActiveWarehouseOptions,
} from "@cofounderai/module-inventory/lib/stock/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { StockList } from "@cofounderai/module-inventory/components/stock/stock-list";
import { recordStockMovementAction } from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function StockPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [levels, products, warehouses, canEdit] = await Promise.all([
    listStockLevels(businessId),
    listActiveProductOptions(businessId),
    listActiveWarehouseOptions(businessId),
    hasPermission(businessId, "inventory.edit"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live stock levels across every warehouse for {business.name}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="inventory.stock" businessSlug={businessSlug} />
        </div>
      </div>

      <StockList
        levels={levels}
        products={products}
        warehouses={warehouses}
        canEdit={canEdit}
        recordAction={recordStockMovementAction.bind(null, businessId)}
      />
    </div>
  );
}
