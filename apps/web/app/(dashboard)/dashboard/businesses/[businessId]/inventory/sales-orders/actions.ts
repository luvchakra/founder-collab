"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  createSalesOrder,
  updateSalesOrder,
  setSalesOrderStatus,
  confirmSalesOrder,
  shipSalesOrder,
  cancelSalesOrder,
} from "@cofounderai/module-inventory/lib/sales-orders/mutations";
import { listSalesOrderItems } from "@cofounderai/module-inventory/lib/sales-orders/queries";
import type { SalesOrderInput } from "@cofounderai/module-inventory/lib/sales-orders/mutations";
import type { SalesOrderItem } from "@cofounderai/module-inventory/lib/sales-orders/types";
import type { SoActionState } from "@cofounderai/module-inventory/components/sales-orders/so-form";

function soPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/sales-orders`;
}

type FormResult = { error: string } | { input: SalesOrderInput };

function readSoForm(formData: FormData): FormResult {
  const customer_id = String(formData.get("customer_id") ?? "").trim();
  const warehouse_id = String(formData.get("warehouse_id") ?? "").trim();
  if (!customer_id) return { error: "Select a customer." };
  if (!warehouse_id) return { error: "Select a fulfilling warehouse." };

  let lines: { product_id: string; quantity: number; unit_price: number; tax_rate: number }[] = [];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Invalid line items." };
  }
  if (lines.length === 0) return { error: "Add at least one line item." };

  return {
    input: {
      customer_id,
      warehouse_id,
      expected_fulfillment_date: String(formData.get("expected_fulfillment_date") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      discount_amount: Number(formData.get("discount_amount")) || 0,
      shipping_amount: Number(formData.get("shipping_amount")) || 0,
      lines,
    },
  };
}

export async function createSalesOrderAction(
  businessId: string,
  _prevState: SoActionState,
  formData: FormData,
): Promise<SoActionState> {
  const parsed = readSoForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "sales_orders.edit");
    await createSalesOrder(businessId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create sales order." };
  }

  revalidatePath(soPath(businessId));
  return { success: true };
}

export async function updateSalesOrderAction(
  businessId: string,
  soId: string,
  _prevState: SoActionState,
  formData: FormData,
): Promise<SoActionState> {
  const parsed = readSoForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "sales_orders.edit");
    await updateSalesOrder(businessId, soId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save sales order." };
  }

  revalidatePath(soPath(businessId));
  return { success: true };
}

export async function setSalesOrderStatusAction(businessId: string, soId: string, status: string): Promise<void> {
  await setSalesOrderStatus(soId, status);
  revalidatePath(soPath(businessId));
}

export async function confirmSalesOrderAction(businessId: string, soId: string): Promise<void> {
  await confirmSalesOrder(soId);
  revalidatePath(soPath(businessId));
}

export async function shipSalesOrderAction(businessId: string, soId: string): Promise<void> {
  await shipSalesOrder(soId);
  revalidatePath(soPath(businessId));
}

export async function cancelSalesOrderAction(businessId: string, soId: string): Promise<void> {
  await cancelSalesOrder(soId);
  revalidatePath(soPath(businessId));
}

export async function fetchSalesOrderItemsAction(soId: string): Promise<SalesOrderItem[]> {
  return listSalesOrderItems(soId);
}
