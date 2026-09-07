import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import {
  listProducts,
  listCategoryOptions,
  listActiveSupplierOptions,
} from "@cofounderai/module-inventory/lib/products/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { ProductsList } from "@cofounderai/module-inventory/components/products/products-list";
import { createProductAction, updateProductAction, toggleProductStatusAction } from "./actions";

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const canViewCost = await hasPermission(businessId, "inventory.view_cost");
  const [products, categories, suppliers, canEdit] = await Promise.all([
    listProducts(businessId, canViewCost),
    listCategoryOptions(businessId),
    listActiveSupplierOptions(businessId),
    hasPermission(businessId, "inventory.edit"),
  ]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your product catalogue and SKUs for {business.name}.
        </p>
      </div>

      <ProductsList
        products={products}
        categoryNameById={categoryNameById}
        supplierNameById={supplierNameById}
        suppliers={suppliers}
        canEdit={canEdit}
        canViewCost={canViewCost}
        createAction={createProductAction.bind(null, businessId)}
        updateAction={updateProductAction.bind(null, businessId)}
        toggleStatusAction={toggleProductStatusAction.bind(null, businessId)}
      />
    </div>
  );
}
