import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import type { StockTransferStatus } from "./types";

export type LineItemInput = { product_id: string; quantity: number };

export type StockTransferInput = {
  source_warehouse_id: string;
  destination_warehouse_id: string;
  notes?: string | null;
  lines: LineItemInput[];
};

function newTransferNumber() {
  return `ST-${Date.now().toString(36).toUpperCase()}`;
}

/** Ported from stockpilot-ai-ops's `saveTransfer` mutation -- create branch. */
export async function createStockTransfer(businessId: string, input: StockTransferInput): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const { data: transfer, error } = await supabase
    .from("stock_transfers")
    .insert({
      business_id: businessId,
      transfer_number: newTransferNumber(),
      source_warehouse_id: input.source_warehouse_id,
      destination_warehouse_id: input.destination_warehouse_id,
      notes: input.notes || null,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from("stock_transfer_items").insert(
    input.lines.map((l) => ({
      business_id: businessId,
      stock_transfer_id: transfer.id,
      item_id: l.product_id,
      quantity: l.quantity,
    })),
  );
  if (itemsError) throw itemsError;
}

/** Ported from stockpilot-ai-ops's `saveTransfer` mutation -- update branch. Draft-only
 * edit, so nothing has shipped against these lines yet -- safe to replace the whole set
 * rather than diff it. */
export async function updateStockTransfer(
  businessId: string,
  transferId: string,
  input: StockTransferInput,
): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const { error } = await supabase
    .from("stock_transfers")
    .update({
      source_warehouse_id: input.source_warehouse_id,
      destination_warehouse_id: input.destination_warehouse_id,
      notes: input.notes || null,
    })
    .eq("id", transferId);
  if (error) throw error;

  const { error: delError } = await supabase.from("stock_transfer_items").delete().eq("stock_transfer_id", transferId);
  if (delError) throw delError;

  const { error: itemsError } = await supabase.from("stock_transfer_items").insert(
    input.lines.map((l) => ({
      business_id: businessId,
      stock_transfer_id: transferId,
      item_id: l.product_id,
      quantity: l.quantity,
    })),
  );
  if (itemsError) throw itemsError;
}

export async function setStockTransferStatus(transferId: string, status: StockTransferStatus): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("stock_transfers").update({ status }).eq("id", transferId);
  if (error) throw error;
}

export async function shipStockTransfer(transferId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ship_stock_transfer", { _transfer_id: transferId });
  if (error) throw error;
}

export async function cancelStockTransfer(transferId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_stock_transfer", { _transfer_id: transferId });
  if (error) throw error;
}

export async function receiveStockTransferItem(
  itemId: string,
  quantity: number,
  damagedQuantity: number,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_stock_transfer_item", {
    _item_id: itemId,
    _quantity: quantity,
    _damaged_quantity: damagedQuantity,
  });
  if (error) throw error;
}
