import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import {
  listStockTransfers,
  listActiveWarehouseOptions,
  listActiveProductOptions,
} from "@cofounderai/module-inventory/lib/stock-transfers/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { TransfersList } from "@cofounderai/module-inventory/components/stock-transfers/transfers-list";
import {
  createStockTransferAction,
  updateStockTransferAction,
  setStockTransferStatusAction,
  shipStockTransferAction,
  cancelStockTransferAction,
  receiveStockTransferItemAction,
  fetchStockTransferItemsAction,
} from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function StockTransfersPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [transfers, warehouses, products, canEdit, canApprove, canReceive, canCancel] = await Promise.all([
    listStockTransfers(businessId),
    listActiveWarehouseOptions(businessId),
    listActiveProductOptions(businessId),
    hasPermission(businessId, "stock_transfers.edit"),
    hasPermission(businessId, "stock_transfers.approve"),
    hasPermission(businessId, "stock_transfers.receive"),
    hasPermission(businessId, "stock_transfers.cancel"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Stock Transfers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Move stock between warehouses with a full in-transit audit trail for {business.name}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="inventory.transfers" businessSlug={businessSlug} />
        </div>
      </div>

      <TransfersList
        transfers={transfers}
        warehouses={warehouses}
        products={products}
        canEdit={canEdit}
        canApprove={canApprove}
        canReceive={canReceive}
        canCancel={canCancel}
        createAction={createStockTransferAction.bind(null, businessId)}
        updateAction={updateStockTransferAction.bind(null, businessId)}
        setStatusAction={setStockTransferStatusAction.bind(null, businessId)}
        shipAction={shipStockTransferAction.bind(null, businessId)}
        cancelAction={cancelStockTransferAction.bind(null, businessId)}
        receiveItemAction={receiveStockTransferItemAction.bind(null, businessId)}
        fetchItems={fetchStockTransferItemsAction}
      />
    </div>
  );
}
