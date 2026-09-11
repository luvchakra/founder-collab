import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { getAvailability } from "@cofounderai/module-inventory/contract/index";
import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";

const POSTGRES_UNIQUE_VIOLATION = "23505";
/** No real deadline for "notify when back in stock" -- a nominal far-future due_at so
 * the row doesn't clutter the Follow-ups queue's own "due soon" views until CRM-10.4's
 * own event handler actually pulls it forward once the item is genuinely replenished. */
const WAITLIST_DUE_DAYS = 30;

export type ConversationProduct = {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number | null;
  /** CRM-10.3: whether a waitlist follow-up already exists for this product interest --
   * the page's own "Waitlist" action is offered only when this is false, so a second
   * click can't even be attempted (belt-and-suspenders on top of `createOutOfStockWaitlist()`'s
   * own idempotency). */
  waitlisted: boolean;
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
  const productInterestIds = rows.map((r) => r.id);
  const [{ data: items, error: itemsError }, { data: waitlistFollowUps, error: waitlistError }] = await Promise.all([
    core.from("items").select("id, name").in("id", itemIds),
    supabase.from("follow_up").select("product_interest_id").eq("business_id", businessId).in("product_interest_id", productInterestIds),
  ]);
  if (itemsError) throw itemsError;
  if (waitlistError) throw waitlistError;
  const itemById = new Map(items.map((item) => [item.id, item]));
  const waitlistedIds = new Set(waitlistFollowUps.map((f) => f.product_interest_id));

  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemName: itemById.get(row.item_id)?.name ?? "Unknown product",
    quantity: row.quantity,
    waitlisted: waitlistedIds.has(row.id),
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

/**
 * CRM-10.3's "Out-of-Stock Opportunity": "Interest captured -> waitlist/follow-up ->
 * inventory event." The interest is already captured (`crm.product_interest`, this
 * function's own caller only offers this action once `getTotalAvailability()` reads 0);
 * this creates the waitlist follow-up and publishes the third step, an event other code
 * (a future Inventory-side reorder suggestion, most plausibly) could react to without
 * this function ever needing to know who's listening (ADR-10, ADR-5).
 *
 * Idempotent per `product_interest_id` (`follow_up_product_interest_id_uq`) -- a second
 * "Waitlist" click on the same product interest returns the existing row instead of
 * creating a duplicate task, checked upfront (the common case, no wasted round trip on
 * a race) with a unique-violation catch as the safety net for a genuine race, same shape
 * `leads/mutations.ts#promoteProspectToLead()` already established.
 */
export async function createOutOfStockWaitlist(businessId: string, productInterestId: string): Promise<{ followUpId: string; alreadyWaitlisted: boolean }> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();

  const { data: interest, error: interestError } = await supabase
    .from("product_interest")
    .select("id, party_id, conversation_id, item_id, quantity")
    .eq("id", productInterestId)
    .eq("business_id", businessId)
    .single();
  if (interestError) throw interestError;

  const { data: existing, error: existingError } = await supabase
    .from("follow_up")
    .select("id")
    .eq("business_id", businessId)
    .eq("product_interest_id", productInterestId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { followUpId: existing.id, alreadyWaitlisted: true };

  const dueAt = new Date(Date.now() + WAITLIST_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: created, error: createError } = await supabase
      .from("follow_up")
      .insert({
        business_id: businessId,
        party_id: interest.party_id,
        conversation_id: interest.conversation_id,
        product_interest_id: productInterestId,
        due_at: dueAt,
      })
      .select("id")
      .single();
    if (createError) throw createError;

    await publishCrmEvent(businessId, "crm.product_interest.stockout_requested", {
      v: 1,
      productInterestId,
      itemId: interest.item_id,
      partyId: interest.party_id,
      quantity: interest.quantity,
    });

    return { followUpId: created.id, alreadyWaitlisted: false };
  } catch (err) {
    if ((err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
      const { data: raced, error: racedError } = await supabase.from("follow_up").select("id").eq("business_id", businessId).eq("product_interest_id", productInterestId).single();
      if (racedError) throw racedError;
      return { followUpId: raced.id, alreadyWaitlisted: true };
    }
    throw err;
  }
}
