"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  createSupplier,
  updateSupplier,
  setSupplierActive,
} from "@cofounderai/module-inventory/lib/suppliers/mutations";
import type { SupplierInput } from "@cofounderai/module-inventory/lib/suppliers/mutations";
import type { SupplierActionState } from "@cofounderai/module-inventory/components/suppliers/supplier-modal";

function suppliersPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/suppliers`;
}

type FormResult = { error: string } | { input: SupplierInput };

function readSupplierForm(formData: FormData): FormResult {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const minOrderQuantityRaw = String(formData.get("min_order_quantity") ?? "").trim();

  return {
    input: {
      name,
      code: String(formData.get("code") ?? "").trim() || null,
      contact_person: String(formData.get("contact_person") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      gst_number: String(formData.get("gst_number") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      state: String(formData.get("state") ?? "").trim() || null,
      payment_terms: String(formData.get("payment_terms") ?? "").trim() || null,
      lead_time_days: Number(formData.get("lead_time_days")) || 7,
      min_order_quantity: minOrderQuantityRaw ? Number(minOrderQuantityRaw) : null,
      rating: Number(formData.get("rating")) || 0,
    },
  };
}

export async function createSupplierAction(
  businessId: string,
  _prevState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  const parsed = readSupplierForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "suppliers.edit");
    await createSupplier(businessId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create supplier." };
  }

  revalidatePath(suppliersPath(businessId));
  return { success: true };
}

export async function updateSupplierAction(
  businessId: string,
  supplierId: string,
  _prevState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  const parsed = readSupplierForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "suppliers.edit");
    await updateSupplier(supplierId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save supplier." };
  }

  revalidatePath(suppliersPath(businessId));
  return { success: true };
}

export async function toggleSupplierActiveAction(
  businessId: string,
  supplierId: string,
  isActive: boolean,
): Promise<void> {
  await requirePermission(businessId, "suppliers.edit");
  await setSupplierActive(supplierId, isActive);
  revalidatePath(suppliersPath(businessId));
}
