import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listCustomers } from "@cofounderai/module-inventory/lib/customers/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { CustomersList } from "@cofounderai/module-inventory/components/customers/customers-list";
import { createCustomerAction, updateCustomerAction, toggleCustomerActiveAction } from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [customers, canEdit] = await Promise.all([
    listCustomers(businessId),
    hasPermission(businessId, "customers.edit"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Buyers for sales orders and invoicing for {business.name}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="inventory.customers" businessSlug={businessSlug} />
        </div>
      </div>

      <CustomersList
        customers={customers}
        canEdit={canEdit}
        createAction={createCustomerAction.bind(null, businessId)}
        updateAction={updateCustomerAction.bind(null, businessId)}
        toggleActiveAction={toggleCustomerActiveAction.bind(null, businessId)}
      />
    </div>
  );
}
