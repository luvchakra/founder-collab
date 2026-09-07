"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  createWarehouse,
  updateWarehouse,
  setWarehouseActive,
} from "@cofounderai/module-inventory/lib/warehouses/mutations";
import type { WarehouseActionState } from "@cofounderai/module-inventory/components/warehouses/warehouse-modal";
import type { WarehouseInput } from "@cofounderai/module-inventory/lib/warehouses/mutations";

function warehousesPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/warehouses`;
}

type FormResult = { error: string } | { input: WarehouseInput };

function readWarehouseForm(formData: FormData): FormResult {
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!name) return { error: "Name is required." };
  if (!code) return { error: "Code is required." };
  return {
    input: {
      name,
      code,
      type: "warehouse",
      city: String(formData.get("city") ?? "").trim() || null,
      state: String(formData.get("state") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      postal_code: String(formData.get("postal_code") ?? "").trim() || null,
      contact_name: String(formData.get("contact_name") ?? "").trim() || null,
      contact_phone: String(formData.get("contact_phone") ?? "").trim() || null,
    },
  };
}

export async function createWarehouseAction(
  businessId: string,
  _prevState: WarehouseActionState,
  formData: FormData,
): Promise<WarehouseActionState> {
  const parsed = readWarehouseForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "inventory.edit");
    await createWarehouse(businessId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create warehouse." };
  }

  revalidatePath(warehousesPath(businessId));
  return { success: true };
}

export async function updateWarehouseAction(
  businessId: string,
  warehouseId: string,
  _prevState: WarehouseActionState,
  formData: FormData,
): Promise<WarehouseActionState> {
  const parsed = readWarehouseForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "inventory.edit");
    await updateWarehouse(warehouseId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save warehouse." };
  }

  revalidatePath(warehousesPath(businessId));
  return { success: true };
}

export async function toggleWarehouseActiveAction(
  businessId: string,
  warehouseId: string,
  isActive: boolean,
): Promise<void> {
  await requirePermission(businessId, "inventory.edit");
  await setWarehouseActive(warehouseId, isActive);
  revalidatePath(warehousesPath(businessId));
}
