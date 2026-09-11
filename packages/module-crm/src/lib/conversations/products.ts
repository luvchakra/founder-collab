import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { getAvailability } from "@cofounderai/module-inventory/contract/index";
import { createClient } from "../../db/server";

export type ConversationProduct = {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number | null;
};

/**
 * CRM-10.1's "associate product references to ... conversation", the read side --
 * mirrors `opportunities/products.ts#listOpportunityProducts()`'s exact shape at the
 * `conversation_id` grain instead. `core.items` is a different schema than `crm.
 * product_interest`, so item name is a separate lookup, not a join (same limitation
 * that file's own doc comment already documents).
 */
export async function listConversationProducts(businessId: string, conversationId: string): Promise<ConversationProduct[]> {
  const supabase = await createClient();
  const core = await createCoreClient({ schema: "core" });

  const { data: rows, error } = await supabase
    .from("product_interest")
    .select("id, item_id, quantity")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (rows.length === 0) return [];

  const itemIds = [...new Set(rows.map((r) => r.item_id))];
  const { data: items, error: itemsError } = await core.from("items").select("id, name").in("id", itemIds);
  if (itemsError) throw itemsError;
  const itemById = new Map(items.map((item) => [item.id, item]));

  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemName: itemById.get(row.item_id)?.name ?? "Unknown product",
    quantity: row.quantity,
  }));
}

/** Gated on Inventory specifically (not just CRM's own license), same defense-in-depth
 * reasoning `opportunities/products.ts#addOpportunityProduct()` already documents. */
export async function addConversationProduct(businessId: string, conversationId: string, itemId: string, quantity: number | null): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const { error } = await supabase.from("product_interest").insert({
    business_id: businessId,
    conversation_id: conversationId,
    item_id: itemId,
    quantity,
  });
  if (error) throw error;
}

export async function removeConversationProduct(businessId: string, conversationId: string, productInterestId: string): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const { error } = await supabase.from("product_interest").delete().eq("id", productInterestId).eq("business_id", businessId).eq("conversation_id", conversationId);
  if (error) throw error;
}

/**
 * CRM-10.2's own acceptance criteria, made concrete: "CRM requests current data from
 * Inventory contract" (this call), "no stock ledger is copied into CRM" (nothing here
 * is ever persisted -- it's computed fresh on every page render), "unlicensed/locked
 * Inventory results in graceful not available state" (`null`, not a thrown error --
 * `getAvailability()` already returns `MODULE_NOT_LICENSED` as a normal `ContractResult`
 * per ADR-10, this just collapses that down to the one bit of information the UI
 * actually needs to render). Sums across every warehouse -- this is a conversation-level
 * "is this in stock at all" signal, not a per-warehouse breakdown a customer-facing
 * conversation has no use for.
 */
export async function getTotalAvailability(businessId: string, itemId: string): Promise<number | null> {
  const result = await getAvailability(businessId, itemId);
  if (!result.ok) return null;
  return result.data.reduce((sum, level) => sum + level.available, 0);
}
