import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listSuppliers } from "@cofounderai/module-inventory/lib/suppliers/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { SuppliersList } from "@cofounderai/module-inventory/components/suppliers/suppliers-list";
import { createSupplierAction, updateSupplierAction, toggleSupplierActiveAction } from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function SuppliersPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [suppliers, canEdit] = await Promise.all([
    listSuppliers(businessId),
    hasPermission(businessId, "suppliers.edit"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Suppliers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vendors and procurement contacts for {business.name}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="inventory.suppliers" businessSlug={businessSlug} />
        </div>
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
