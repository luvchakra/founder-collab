"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { recordStockMovement } from "@cofounderai/module-inventory/lib/stock/mutations";
import type { StockMovementInput } from "@cofounderai/module-inventory/lib/stock/mutations";
import type { MovementActionState } from "@cofounderai/module-inventory/components/stock/movement-modal";

function stockPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/stock`;
}

type FormResult = { error: string } | { input: StockMovementInput };

function readMovementForm(formData: FormData): FormResult {
  const product_id = String(formData.get("product_id") ?? "").trim();
  const warehouse_id = String(formData.get("warehouse_id") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  if (!product_id) return { error: "Select a product." };
  if (!warehouse_id) return { error: "Select a warehouse." };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantity must be positive." };

  return {
    input: {
      product_id,
      warehouse_id,
      type,
      quantity,
      reference: String(formData.get("reference") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  };
}

export async function recordStockMovementAction(
  businessId: string,
  _prevState: MovementActionState,
  formData: FormData,
): Promise<MovementActionState> {
  const parsed = readMovementForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "inventory.edit");
    await recordStockMovement(businessId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record movement." };
  }

  revalidatePath(stockPath(businessId));
  return { success: true };
}
