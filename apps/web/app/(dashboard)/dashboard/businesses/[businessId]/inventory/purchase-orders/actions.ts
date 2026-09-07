"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  setPurchaseOrderStatus,
  receivePurchaseOrderItem,
} from "@cofounderai/module-inventory/lib/purchase-orders/mutations";
import { listPurchaseOrderItems } from "@cofounderai/module-inventory/lib/purchase-orders/queries";
import type { PurchaseOrderInput } from "@cofounderai/module-inventory/lib/purchase-orders/mutations";
import type { PurchaseOrderItem } from "@cofounderai/module-inventory/lib/purchase-orders/types";
import type { PoActionState } from "@cofounderai/module-inventory/components/purchase-orders/po-form";

function poPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/purchase-orders`;
}

type FormResult = { error: string } | { input: PurchaseOrderInput };

function readPoForm(formData: FormData): FormResult {
  const supplier_id = String(formData.get("supplier_id") ?? "").trim();
  const warehouse_id = String(formData.get("warehouse_id") ?? "").trim();
  if (!supplier_id) return { error: "Select a supplier." };
  if (!warehouse_id) return { error: "Select a receiving warehouse." };

  let lines: { product_id: string; quantity: number; unit_cost: number; tax_rate: number }[] = [];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Invalid line items." };
  }
  if (lines.length === 0) return { error: "Add at least one line item." };

  return {
    input: {
      supplier_id,
      warehouse_id,
      expected_delivery_date: String(formData.get("expected_delivery_date") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      discount_amount: Number(formData.get("discount_amount")) || 0,
      shipping_amount: Number(formData.get("shipping_amount")) || 0,
      lines,
    },
  };
}

export async function createPurchaseOrderAction(
  businessId: string,
  _prevState: PoActionState,
  formData: FormData,
): Promise<PoActionState> {
  const parsed = readPoForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "purchase_orders.edit");
    await createPurchaseOrder(businessId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create purchase order." };
  }

  revalidatePath(poPath(businessId));
  return { success: true };
}

export async function updatePurchaseOrderAction(
  businessId: string,
  poId: string,
  _prevState: PoActionState,
  formData: FormData,
): Promise<PoActionState> {
  const parsed = readPoForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "purchase_orders.edit");
    await updatePurchaseOrder(businessId, poId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save purchase order." };
  }

  revalidatePath(poPath(businessId));
  return { success: true };
}

export async function setPurchaseOrderStatusAction(businessId: string, poId: string, status: string): Promise<void> {
  await setPurchaseOrderStatus(poId, status);
  revalidatePath(poPath(businessId));
}

export async function receivePurchaseOrderItemAction(
  businessId: string,
  itemId: string,
  quantity: number,
): Promise<void> {
  await receivePurchaseOrderItem(itemId, quantity);
  revalidatePath(poPath(businessId));
}

export async function fetchPurchaseOrderItemsAction(poId: string): Promise<PurchaseOrderItem[]> {
  return listPurchaseOrderItems(poId);
}
