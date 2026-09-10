import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { listFsmCustomers } from "@cofounderai/module-fsm/lib/customers/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { CustomersList } from "@cofounderai/module-fsm/components/customers/customers-list";
import { updateFsmCustomerAction } from "./actions";

export default async function FsmCustomersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [customers, canEdit] = await Promise.all([listFsmCustomers(businessId), hasPermission(businessId, "customers.edit")]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Parties with the customer role for {business.name} -- the same list inventory sees, when both are licensed.
        </p>
      </div>

      <CustomersList customers={customers} canEdit={canEdit} updateAction={updateFsmCustomerAction.bind(null, businessId)} />
    </div>
  );
}
