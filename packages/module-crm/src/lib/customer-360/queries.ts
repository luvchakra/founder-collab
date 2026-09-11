import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { listRecentOrdersForParty } from "@cofounderai/module-inventory/contract/index";
import { listRecentJobsForParty } from "@cofounderai/module-fsm/contract/index";
import { getProspectSummaryForParty } from "@cofounderai/module-discovery/contract/index";
import { createClient } from "../../db/server";
import type { Customer360 } from "./types";

const RECENT_CONVERSATIONS_LIMIT = 5;

/** CRM-01.3/CRM-02.1's `getCustomer360()` contract operation -- see ./types.ts's own doc
 * comment for the overall shape and why GST/payment-aging sections aren't included yet. */
export async function getCustomer360(businessId: string, partyId: string): Promise<Customer360> {
  const supabase = await createClient();
  const core = await createCoreClient({ schema: "core" });

  const { data: party, error: partyError } = await core
    .from("parties")
    .select("name, email, phone")
    .eq("business_id", businessId)
    .eq("id", partyId)
    .single();
  if (partyError) throw partyError;

  const { data: mostRecentLead, error: mostRecentLeadError } = await supabase
    .from("lead")
    .select("status, owner_id, source")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mostRecentLeadError) throw mostRecentLeadError;

  const { data: openLeads, error: leadsError } = await supabase
    .from("lead")
    .select("*")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .not("status", "in", "(won,lost,disqualified)");
  if (leadsError) throw leadsError;

  const { data: openOpportunities, error: opportunitiesError } = await supabase
    .from("opportunity")
    .select("id, status, stage_id, created_at")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .eq("status", "open");
  if (opportunitiesError) throw opportunitiesError;

  const { data: openFollowUps, error: followUpsError } = await supabase
    .from("follow_up")
    .select("*")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .eq("status", "pending")
    .order("due_at", { ascending: true });
  if (followUpsError) throw followUpsError;

  const { data: recentConversations, error: conversationsError } = await supabase
    .from("conversation")
    .select("id, primary_channel, status, last_interaction_at")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(RECENT_CONVERSATIONS_LIMIT);
  if (conversationsError) throw conversationsError;

  const { data: productInterests, error: productInterestsError } = await supabase
    .from("product_interest")
    .select("id, item_id, quantity")
    .eq("business_id", businessId)
    .eq("party_id", partyId);
  if (productInterestsError) throw productInterestsError;

  // core.items is a different schema than crm.product_interest -- PostgREST embedded
  // selects don't span schemas, so item names are a separate lookup rather than a join.
  const itemIds = [...new Set((productInterests ?? []).map((p) => p.item_id))];
  const itemNamesById = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data: items, error: itemsError } = await core.from("items").select("id, name").in("id", itemIds);
    if (itemsError) throw itemsError;
    for (const item of items) itemNamesById.set(item.id, item.name);
  }

  const { data: notes, error: notesError } = await supabase
    .from("crm_note")
    .select("id, body, author_id, created_at")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("created_at", { ascending: false });
  if (notesError) throw notesError;

  const [prospectResult, ordersResult, jobsResult] = await Promise.all([
    getProspectSummaryForParty(businessId, partyId),
    listRecentOrdersForParty(businessId, partyId),
    listRecentJobsForParty(businessId, partyId),
  ]);

  return {
    partyId,
    name: party.name,
    contactMethods: { email: party.email, phone: party.phone },
    lifecycleStatus: mostRecentLead?.status ?? null,
    ownerId: mostRecentLead?.owner_id ?? null,
    source: mostRecentLead?.source ?? null,
    productsOfInterest: (productInterests ?? []).map((p) => ({
      id: p.id,
      itemId: p.item_id,
      itemName: itemNamesById.get(p.item_id) ?? "Unknown item",
      quantity: p.quantity,
    })),
    openLeads: openLeads ?? [],
    openOpportunities: (openOpportunities ?? []).map((o) => ({ id: o.id, status: o.status, stageId: o.stage_id, createdAt: o.created_at })),
    openFollowUps: openFollowUps ?? [],
    recentConversations: (recentConversations ?? []).map((c) => ({
      id: c.id,
      primaryChannel: c.primary_channel,
      status: c.status,
      lastInteractionAt: c.last_interaction_at,
    })),
    notes: (notes ?? []).map((n) => ({ id: n.id, body: n.body, authorId: n.author_id, createdAt: n.created_at })),
    prospect: prospectResult.ok ? prospectResult.data : null,
    recentOrders: ordersResult.ok ? ordersResult.data : [],
    recentJobs: jobsResult.ok ? jobsResult.data : [],
  };
}
