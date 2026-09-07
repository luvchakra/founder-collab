import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import {
  listStockLevels,
  listActiveProductOptions,
  listActiveWarehouseOptions,
} from "@cofounderai/module-inventory/lib/stock/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { StockList } from "@cofounderai/module-inventory/components/stock/stock-list";
import { recordStockMovementAction } from "./actions";

export default async function StockPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
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
      <div>
        <h1 className="text-xl font-semibold">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live stock levels across every warehouse for {business.name}.
        </p>
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
