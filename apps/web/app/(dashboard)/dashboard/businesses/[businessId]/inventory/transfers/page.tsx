import { notFound } from "next/navigation";
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

export default async function StockTransfersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
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
      <div>
        <h1 className="text-xl font-semibold">Stock Transfers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Move stock between warehouses with a full in-transit audit trail for {business.name}.
        </p>
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
