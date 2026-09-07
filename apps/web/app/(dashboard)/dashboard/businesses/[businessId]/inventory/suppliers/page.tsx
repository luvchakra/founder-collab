import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listSuppliers } from "@cofounderai/module-inventory/lib/suppliers/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { SuppliersList } from "@cofounderai/module-inventory/components/suppliers/suppliers-list";
import { createSupplierAction, updateSupplierAction, toggleSupplierActiveAction } from "./actions";

export default async function SuppliersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [suppliers, canEdit] = await Promise.all([
    listSuppliers(businessId),
    hasPermission(businessId, "suppliers.edit"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Suppliers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vendors and procurement contacts for {business.name}.
        </p>
      </div>

      <SuppliersList
        suppliers={suppliers}
        canEdit={canEdit}
        createAction={createSupplierAction.bind(null, businessId)}
        updateAction={updateSupplierAction.bind(null, businessId)}
        toggleActiveAction={toggleSupplierActiveAction.bind(null, businessId)}
      />
    </div>
  );
}
