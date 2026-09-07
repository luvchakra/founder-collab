"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  createProduct,
  updateProduct,
  setProductStatus,
} from "@cofounderai/module-inventory/lib/products/mutations";
import type { ProductInput } from "@cofounderai/module-inventory/lib/products/mutations";
import type { ProductActionState } from "@cofounderai/module-inventory/components/products/product-modal";

function productsPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/products`;
}

type FormResult = { error: string } | { input: ProductInput };

function readProductForm(formData: FormData): FormResult {
  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!sku) return { error: "SKU is required." };
  if (!name) return { error: "Name is required." };

  return {
    input: {
      sku,
      name,
      brand: String(formData.get("brand") ?? "").trim() || null,
      barcode: String(formData.get("barcode") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      categoryName: String(formData.get("category") ?? "").trim() || null,
      supplier_id: String(formData.get("supplier_id") ?? "").trim() || null,
      unit: String(formData.get("unit") ?? "pcs").trim() || "pcs",
      hsn_code: String(formData.get("hsn_code") ?? "").trim() || null,
      tax_rate: Number(formData.get("tax_rate")) || 0,
      cost_price: Number(formData.get("cost_price")) || 0,
      selling_price: Number(formData.get("selling_price")) || 0,
      reorder_point: Number(formData.get("reorder_point")) || 0,
      reorder_quantity: Number(formData.get("reorder_quantity")) || 0,
    },
  };
}

export async function createProductAction(
  businessId: string,
  _prevState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const parsed = readProductForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "inventory.edit");
    await createProduct(businessId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create product." };
  }

  revalidatePath(productsPath(businessId));
  return { success: true };
}

export async function updateProductAction(
  businessId: string,
  productId: string,
  _prevState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const parsed = readProductForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "inventory.edit");
    await updateProduct(businessId, productId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save product." };
  }

  revalidatePath(productsPath(businessId));
  return { success: true };
}

export async function toggleProductStatusAction(
  businessId: string,
  productId: string,
  status: "active" | "inactive",
): Promise<void> {
  await requirePermission(businessId, "inventory.edit");
  await setProductStatus(productId, status);
  revalidatePath(productsPath(businessId));
}
