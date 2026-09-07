import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import {
  listPurchaseOrders,
  listActiveSupplierOptions,
  listActiveWarehouseOptions,
  listActiveProductOptions,
} from "@cofounderai/module-inventory/lib/purchase-orders/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PurchaseOrdersList } from "@cofounderai/module-inventory/components/purchase-orders/purchase-orders-list";
import {
  createPurchaseOrderAction,
  updatePurchaseOrderAction,
  setPurchaseOrderStatusAction,
  receivePurchaseOrderItemAction,
  fetchPurchaseOrderItemsAction,
} from "./actions";

export default async function PurchaseOrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [canEdit, canApprove, canReceive, canViewCost] = await Promise.all([
    hasPermission(businessId, "purchase_orders.edit"),
    hasPermission(businessId, "purchase_orders.approve"),
    hasPermission(businessId, "purchase_orders.receive"),
    hasPermission(businessId, "inventory.view_cost"),
  ]);
  const [purchaseOrders, suppliers, warehouses, products] = await Promise.all([
    listPurchaseOrders(businessId),
    listActiveSupplierOptions(businessId),
    listActiveWarehouseOptions(businessId),
    listActiveProductOptions(businessId, canViewCost),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Purchase Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create, approve and receive purchase orders for {business.name}.
        </p>
      </div>

      <PurchaseOrdersList
        purchaseOrders={purchaseOrders}
        suppliers={suppliers}
        warehouses={warehouses}
        products={products}
        canEdit={canEdit}
        canApprove={canApprove}
        canReceive={canReceive}
        createAction={createPurchaseOrderAction.bind(null, businessId)}
        updateAction={updatePurchaseOrderAction.bind(null, businessId)}
        setStatusAction={setPurchaseOrderStatusAction.bind(null, businessId)}
        receiveItemAction={receivePurchaseOrderItemAction.bind(null, businessId)}
        fetchItems={fetchPurchaseOrderItemsAction}
      />
    </div>
  );
}
