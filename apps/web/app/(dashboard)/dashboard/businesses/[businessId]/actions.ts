"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  updateBusiness,
  createProductsBulk,
  deleteProduct,
  disableProduct,
  enableProduct,
} from "@cofounderai/module-discovery/lib/tenancy/mutations";
import {
  parseProductImportFile,
  type ProductImportRow,
  type ProductImportPreviewResult,
} from "@cofounderai/module-discovery/lib/tenancy/parse-products-import";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";

export async function renameBusinessAction(
  businessId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  try {
    await updateBusiness(businessId, { name });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath("/dashboard"); // sidebar and header business selector also show the name
  return { success: true };
}

export async function updateBusinessDescriptionAction(
  businessId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const description = String(formData.get("value") ?? "");

  try {
    await updateBusiness(businessId, { description });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

export async function updateBusinessWebsiteAction(
  businessId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const website = String(formData.get("value") ?? "");

  try {
    await updateBusiness(businessId, { website });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

/**
 * Step 1 of the business page's product-catalog import: parses the uploaded file and
 * returns every row, not just a preview slice -- the client component holds the full
 * array and renders only the first few, then hands the same array straight to
 * `importProductsAction` on confirm (no second upload/parse needed, and nothing is
 * written to the database yet at this step).
 */
export async function previewProductImportAction(
  _businessId: string,
  _prevState: ProductImportPreviewResult | null,
  formData: FormData,
): Promise<ProductImportPreviewResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to preview." };
  }

  try {
    const { rows, errors, usedFallback } = await parseProductImportFile(file);
    if (rows.length === 0) {
      return { error: errors[0] ?? "Could not find any products in that file." };
    }
    return { rows, errors, usedFallback };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not read that file." };
  }
}

/** Step 2: actually creates the products, from the rows step 1 already parsed and the
 * founder already reviewed -- called directly (not through a <form>), since the rows
 * live in the client component's own state by this point, not in a fresh FormData. */
export async function importProductsAction(
  businessId: string,
  rows: ProductImportRow[],
): Promise<{ inserted: number; duplicates: number }> {
  const result = await createProductsBulk(businessId, rows);
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return result;
}

export async function deleteProductAction(
  businessId: string,
  productId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteProduct(productId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not delete this product." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

export async function disableProductAction(
  businessId: string,
  productId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await disableProduct(productId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not disable this product." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

export async function enableProductAction(
  businessId: string,
  productId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await enableProduct(productId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not enable this product." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}
