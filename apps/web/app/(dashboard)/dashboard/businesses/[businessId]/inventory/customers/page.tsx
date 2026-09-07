import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listCustomers } from "@cofounderai/module-inventory/lib/customers/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { CustomersList } from "@cofounderai/module-inventory/components/customers/customers-list";
import { createCustomerAction, updateCustomerAction, toggleCustomerActiveAction } from "./actions";

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [customers, canEdit] = await Promise.all([
    listCustomers(businessId),
    hasPermission(businessId, "customers.edit"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Buyers for sales orders and invoicing for {business.name}.
        </p>
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
