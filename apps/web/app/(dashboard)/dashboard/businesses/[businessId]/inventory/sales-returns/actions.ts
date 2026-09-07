"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  createSalesReturn,
  approveSalesReturn,
  setSalesReturnStatus,
} from "@cofounderai/module-inventory/lib/sales-returns/mutations";
import { listSalesReturnItems, listSalesOrderItemsForReturn } from "@cofounderai/module-inventory/lib/sales-returns/queries";
import type { SalesReturnInput } from "@cofounderai/module-inventory/lib/sales-returns/mutations";
import type { SalesReturnItem, SalesReturnStatus, SoItemForReturn } from "@cofounderai/module-inventory/lib/sales-returns/types";
import type { ReturnActionState } from "@cofounderai/module-inventory/components/sales-returns/return-form";

function returnsPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/sales-returns`;
}

type FormResult = { error: string } | { input: SalesReturnInput };

function readReturnForm(formData: FormData): FormResult {
  const sales_order_id = String(formData.get("sales_order_id") ?? "").trim();
  if (!sales_order_id) return { error: "Select a sales order." };

  let lines: SalesReturnInput["lines"] = [];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Invalid line items." };
  }
  if (lines.length === 0) return { error: "Add at least one returned line item." };

  return {
    input: {
      sales_order_id,
      notes: String(formData.get("notes") ?? "").trim() || null,
      lines,
    },
  };
}

export async function createSalesReturnAction(
  businessId: string,
  _prevState: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const parsed = readReturnForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await createSalesReturn(businessId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create return." };
  }

  revalidatePath(returnsPath(businessId));
  return { success: true };
}

export async function approveSalesReturnAction(businessId: string, returnId: string): Promise<void> {
  await requirePermission(businessId, "sales_returns.approve");
  await approveSalesReturn(returnId);
  revalidatePath(returnsPath(businessId));
}

export async function setSalesReturnStatusAction(businessId: string, returnId: string, status: string): Promise<void> {
  await setSalesReturnStatus(returnId, status as SalesReturnStatus);
  revalidatePath(returnsPath(businessId));
}

export async function fetchSalesReturnItemsAction(returnId: string): Promise<SalesReturnItem[]> {
  return listSalesReturnItems(returnId);
}

export async function fetchSalesOrderItemsForReturnAction(salesOrderId: string): Promise<SoItemForReturn[]> {
  return listSalesOrderItemsForReturn(salesOrderId);
}
