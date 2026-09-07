"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { parseProductsCsv } from "@cofounderai/module-inventory/lib/products/csv";
import {
  listProductSkus,
  listActiveSupplierOptions,
} from "@cofounderai/module-inventory/lib/products/queries";
import { createProductsBulk } from "@cofounderai/module-inventory/lib/products/mutations";

export async function importProductsAction(businessId: string, formData: FormData) {
  await requirePermission(businessId, "inventory.edit");

  const csv = String(formData.get("csv") ?? "");
  const [existingSkus, suppliers] = await Promise.all([
    listProductSkus(businessId),
    listActiveSupplierOptions(businessId),
  ]);
  const supplierIdByNameLower = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]));

  const { rows, errors } = parseProductsCsv(csv, supplierIdByNameLower);
  if (rows.length === 0) {
    throw new Error(errors[0] ?? "No valid rows to import.");
  }

  // Dedup against both the existing catalogue and the rest of this same paste (two rows
  // in one CSV can share a SKU), same shape as module-discovery's prospects CSV import.
  const existingSkusLower = new Set(existingSkus.map((s) => s.toLowerCase()));
  const seenSkus = new Set<string>();
  const toInsert: typeof rows = [];
  let duplicates = 0;

  for (const row of rows) {
    const skuLower = row.sku.toLowerCase();
    if (seenSkus.has(skuLower) || existingSkusLower.has(skuLower)) {
      duplicates += 1;
      continue;
    }
    seenSkus.add(skuLower);
    toInsert.push(row);
  }

  const created = toInsert.length > 0 ? await createProductsBulk(businessId, toInsert) : 0;

  const productsPath = `/dashboard/businesses/${businessId}/inventory/products`;
  revalidatePath(productsPath);
  redirect(`${productsPath}?imported=${created}&skipped=${errors.length}&duplicates=${duplicates}`);
}
