import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listSalesReturns, listEligibleSalesOrders } from "@cofounderai/module-inventory/lib/sales-returns/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { ReturnsList } from "@cofounderai/module-inventory/components/sales-returns/returns-list";
import {
  createSalesReturnAction,
  approveSalesReturnAction,
  setSalesReturnStatusAction,
  fetchSalesReturnItemsAction,
  fetchSalesOrderItemsForReturnAction,
} from "./actions";

export default async function SalesReturnsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [salesReturns, eligibleSalesOrders, canCreate, canApprove, canCancel] = await Promise.all([
    listSalesReturns(businessId),
    listEligibleSalesOrders(businessId),
    hasPermission(businessId, "sales_returns.create"),
    hasPermission(businessId, "sales_returns.approve"),
    hasPermission(businessId, "sales_returns.cancel"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Sales Returns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Process customer returns, restock or credit-only, and issue credit notes for {business.name}.
        </p>
      </div>

      <ReturnsList
        salesReturns={salesReturns}
        eligibleSalesOrders={eligibleSalesOrders}
        canCreate={canCreate}
        canApprove={canApprove}
        canCancel={canCancel}
        createAction={createSalesReturnAction.bind(null, businessId)}
        approveAction={approveSalesReturnAction.bind(null, businessId)}
        setStatusAction={setSalesReturnStatusAction.bind(null, businessId)}
        fetchItems={fetchSalesReturnItemsAction}
        fetchSoItems={fetchSalesOrderItemsForReturnAction}
      />
    </div>
  );
}
