import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import {
  listSalesOrders,
  listActiveCustomerOptions,
  listActiveWarehouseOptions,
  listActiveProductOptions,
} from "@cofounderai/module-inventory/lib/sales-orders/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { SalesOrdersList } from "@cofounderai/module-inventory/components/sales-orders/sales-orders-list";
import {
  createSalesOrderAction,
  updateSalesOrderAction,
  setSalesOrderStatusAction,
  confirmSalesOrderAction,
  shipSalesOrderAction,
  cancelSalesOrderAction,
  fetchSalesOrderItemsAction,
} from "./actions";

export default async function SalesOrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [salesOrders, customers, warehouses, products, canEdit, canConfirm, canShip, canCancel, canCreateReturn] =
    await Promise.all([
      listSalesOrders(businessId),
      listActiveCustomerOptions(businessId),
      listActiveWarehouseOptions(businessId),
      listActiveProductOptions(businessId),
      hasPermission(businessId, "sales_orders.edit"),
      hasPermission(businessId, "sales_orders.confirm"),
      hasPermission(businessId, "sales_orders.ship"),
      hasPermission(businessId, "sales_orders.cancel"),
      hasPermission(businessId, "sales_returns.create"),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Sales Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create, confirm and fulfil sales orders for {business.name}.</p>
      </div>

      <SalesOrdersList
        businessId={businessId}
        salesOrders={salesOrders}
        customers={customers}
        warehouses={warehouses}
        products={products}
        canEdit={canEdit}
        canConfirm={canConfirm}
        canShip={canShip}
        canCancel={canCancel}
        canCreateReturn={canCreateReturn}
        createAction={createSalesOrderAction.bind(null, businessId)}
        updateAction={updateSalesOrderAction.bind(null, businessId)}
        setStatusAction={setSalesOrderStatusAction.bind(null, businessId)}
        confirmAction={confirmSalesOrderAction.bind(null, businessId)}
        shipAction={shipSalesOrderAction.bind(null, businessId)}
        cancelAction={cancelSalesOrderAction.bind(null, businessId)}
        fetchItems={fetchSalesOrderItemsAction}
      />
    </div>
  );
}
