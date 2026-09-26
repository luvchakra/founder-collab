import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
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
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function SalesReturnsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Sales Returns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Process customer returns, restock or credit-only, and issue credit notes for {business.name}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="inventory.sales-returns" businessSlug={businessSlug} />
        </div>
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
