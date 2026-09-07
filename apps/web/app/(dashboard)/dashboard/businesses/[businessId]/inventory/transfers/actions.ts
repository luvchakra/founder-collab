"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  createStockTransfer,
  updateStockTransfer,
  setStockTransferStatus,
  shipStockTransfer,
  cancelStockTransfer,
  receiveStockTransferItem,
} from "@cofounderai/module-inventory/lib/stock-transfers/mutations";
import { listStockTransferItems } from "@cofounderai/module-inventory/lib/stock-transfers/queries";
import type { StockTransferInput } from "@cofounderai/module-inventory/lib/stock-transfers/mutations";
import type { StockTransferStatus, StockTransferItem } from "@cofounderai/module-inventory/lib/stock-transfers/types";
import type { TransferActionState } from "@cofounderai/module-inventory/components/stock-transfers/transfer-form";

function transfersPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/transfers`;
}

type FormResult = { error: string } | { input: StockTransferInput };

function readTransferForm(formData: FormData): FormResult {
  const source_warehouse_id = String(formData.get("source_warehouse_id") ?? "").trim();
  const destination_warehouse_id = String(formData.get("destination_warehouse_id") ?? "").trim();
  if (!source_warehouse_id) return { error: "Select a source warehouse." };
  if (!destination_warehouse_id) return { error: "Select a destination warehouse." };
  if (source_warehouse_id === destination_warehouse_id) {
    return { error: "Source and destination warehouses must be different." };
  }

  let lines: { product_id: string; quantity: number }[] = [];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Invalid line items." };
  }
  if (lines.length === 0) return { error: "Add at least one line item." };

  return {
    input: {
      source_warehouse_id,
      destination_warehouse_id,
      notes: String(formData.get("notes") ?? "").trim() || null,
      lines,
    },
  };
}

export async function createStockTransferAction(
  businessId: string,
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const parsed = readTransferForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "stock_transfers.edit");
    await createStockTransfer(businessId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create stock transfer." };
  }

  revalidatePath(transfersPath(businessId));
  return { success: true };
}

export async function updateStockTransferAction(
  businessId: string,
  transferId: string,
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const parsed = readTransferForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "stock_transfers.edit");
    await updateStockTransfer(businessId, transferId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save stock transfer." };
  }

  revalidatePath(transfersPath(businessId));
  return { success: true };
}

export async function setStockTransferStatusAction(
  businessId: string,
  transferId: string,
  status: string,
): Promise<void> {
  await setStockTransferStatus(transferId, status as StockTransferStatus);
  revalidatePath(transfersPath(businessId));
}

export async function shipStockTransferAction(businessId: string, transferId: string): Promise<void> {
  await shipStockTransfer(transferId);
  revalidatePath(transfersPath(businessId));
}

export async function cancelStockTransferAction(businessId: string, transferId: string): Promise<void> {
  await cancelStockTransfer(transferId);
  revalidatePath(transfersPath(businessId));
}

export async function receiveStockTransferItemAction(
  businessId: string,
  itemId: string,
  quantity: number,
  damaged: number,
): Promise<void> {
  await receiveStockTransferItem(itemId, quantity, damaged);
  revalidatePath(transfersPath(businessId));
}

export async function fetchStockTransferItemsAction(transferId: string): Promise<StockTransferItem[]> {
  return listStockTransferItems(transferId);
}
