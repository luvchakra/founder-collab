import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import {
  listProducts,
  listCategoryOptions,
  listActiveSupplierOptions,
} from "@cofounderai/module-inventory/lib/products/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { ProductsList } from "@cofounderai/module-inventory/components/products/products-list";
import {
  createProductAction,
  updateProductAction,
  toggleProductStatusAction,
  generateBarcodesAction,
} from "./actions";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ imported?: string; skipped?: string; duplicates?: string }>;
}) {
  const { businessId } = await params;
  const { imported, skipped, duplicates } = await searchParams;
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

      {imported ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          Imported {imported} product{imported === "1" ? "" : "s"}.
          {skipped && skipped !== "0" ? ` Skipped ${skipped} row(s) missing sku/name or invalid.` : ""}
          {duplicates && duplicates !== "0"
            ? ` Skipped ${duplicates} row(s) already in your catalogue.`
            : ""}
        </p>
      ) : null}

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
        generateBarcodesAction={generateBarcodesAction.bind(null, businessId)}
        importHref={`/dashboard/businesses/${businessId}/inventory/products/import`}
      />
    </div>
  );
}
