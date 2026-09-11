import { listCompletedJobsForReactivation } from "@cofounderai/module-fsm/contract/index";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { getTotalAvailability } from "../conversations/products";
import type { ReactivationOpportunity } from "./types";

const INACTIVE_DAYS = 60;
const STALE_LEAD_DAYS = 30;
const RENEWED_SIGNAL_DAYS = 3;
const OLD_INTEREST_DAYS = 7;
const RECURRING_SERVICE_DAYS = 60;
const MAX_PER_SIGNAL = 20;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** "Previously active customer now inactive": a party with interaction history, none of
 * it recent, and no lead/opportunity currently open (an open one means someone's
 * already on it -- not lost, just pending). */
async function detectInactiveCustomers(businessId: string): Promise<ReactivationOpportunity[]> {
  const supabase = await createClient();
  const { data: interactions, error } = await supabase
    .from("interaction")
    .select("party_id, occurred_at")
    .eq("business_id", businessId)
    .not("party_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const lastInteractionByParty = new Map<string, string>();
  for (const row of interactions) {
    const partyId = row.party_id as string;
    if (!lastInteractionByParty.has(partyId)) lastInteractionByParty.set(partyId, row.occurred_at);
  }

  const cutoff = daysAgo(INACTIVE_DAYS);
  const candidateIds = [...lastInteractionByParty.entries()].filter(([, lastAt]) => lastAt < cutoff).map(([partyId]) => partyId);
  if (candidateIds.length === 0) return [];

  const { data: openLeadsAndOpps, error: openError } = await supabase
    .from("lead")
    .select("party_id")
    .eq("business_id", businessId)
    .in("party_id", candidateIds)
    .not("status", "in", "(won,lost,disqualified)");
  if (openError) throw openError;
  const openOppRes = await supabase
    .from("opportunity")
    .select("party_id")
    .eq("business_id", businessId)
    .in("party_id", candidateIds)
    .eq("status", "open");
  if (openOppRes.error) throw openOppRes.error;
  const excluded = new Set([...(openLeadsAndOpps ?? []).map((r) => r.party_id), ...(openOppRes.data ?? []).map((r) => r.party_id)]);

  const finalIds = candidateIds.filter((id) => !excluded.has(id)).slice(0, MAX_PER_SIGNAL);
  return finalIds.map((partyId) => ({
    partyId,
    partyName: "",
    reason: "inactive" as const,
    detail: `No interaction since ${lastInteractionByParty.get(partyId)!.slice(0, 10)}`,
    suggestedAction: "Send a check-in message",
  }));
}

/** "Old lead with renewed signal": a lead that's sat open for a while just got a fresh
 * interaction -- worth a second look, not just a stale record. */
async function detectRenewedLeads(businessId: string): Promise<ReactivationOpportunity[]> {
  const supabase = await createClient();
  const { data: staleLeads, error } = await supabase
    .from("lead")
    .select("party_id")
    .eq("business_id", businessId)
    .not("status", "in", "(won,lost,disqualified)")
    .lt("created_at", daysAgo(STALE_LEAD_DAYS));
  if (error) throw error;
  if (staleLeads.length === 0) return [];

  const partyIds = [...new Set(staleLeads.map((l) => l.party_id))];
  const { data: recentInteractions, error: interactionsError } = await supabase
    .from("interaction")
    .select("party_id, occurred_at")
    .eq("business_id", businessId)
    .in("party_id", partyIds)
    .gte("occurred_at", daysAgo(RENEWED_SIGNAL_DAYS))
    .order("occurred_at", { ascending: false });
  if (interactionsError) throw interactionsError;

  const renewedAtByParty = new Map<string, string>();
  for (const row of recentInteractions) {
    const partyId = row.party_id as string;
    if (!renewedAtByParty.has(partyId)) renewedAtByParty.set(partyId, row.occurred_at);
  }

  return [...renewedAtByParty.entries()].slice(0, MAX_PER_SIGNAL).map(([partyId, occurredAt]) => ({
    partyId,
    partyName: "",
    reason: "renewed_lead" as const,
    detail: `Dormant lead, new activity ${occurredAt.slice(0, 10)}`,
    suggestedAction: "Follow up on this lead now",
  }));
}

/** "Previous product interest + new stock": an interest recorded a while ago, on an
 * item that's available again right now. */
async function detectRestockedInterest(businessId: string): Promise<ReactivationOpportunity[]> {
  const supabase = await createClient();
  const { data: interests, error } = await supabase
    .from("product_interest")
    .select("party_id, item_id, created_at")
    .eq("business_id", businessId)
    .lt("created_at", daysAgo(OLD_INTEREST_DAYS))
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  if (interests.length === 0) return [];

  const core = await createCoreClient({ schema: "core" });
  const itemIds = [...new Set(interests.map((i) => i.item_id))];
  const [{ data: items, error: itemsError }, availabilityByItemId] = await Promise.all([
    core.from("items").select("id, name").in("id", itemIds),
    (async () => new Map(await Promise.all(itemIds.map(async (id) => [id, await getTotalAvailability(businessId, id)] as const))))(),
  ]);
  if (itemsError) throw itemsError;
  const itemNameById = new Map(items.map((i) => [i.id, i.name]));

  const results: ReactivationOpportunity[] = [];
  for (const interest of interests) {
    const availability = availabilityByItemId.get(interest.item_id);
    if (!availability || availability <= 0) continue;
    results.push({
      partyId: interest.party_id,
      partyName: "",
      reason: "restocked_interest",
      detail: `${itemNameById.get(interest.item_id) ?? "Item"} is back in stock (${availability} available)`,
      suggestedAction: "Let them know it's available",
    });
    if (results.length >= MAX_PER_SIGNAL) break;
  }
  return results;
}

/** "Completed service + likely recurring need": a job finished a while ago, for a
 * service type that's plausibly due again. */
async function detectRecurringServiceNeed(businessId: string): Promise<ReactivationOpportunity[]> {
  const jobsResult = await listCompletedJobsForReactivation(businessId);
  if (!jobsResult.ok) return [];

  const mostRecentByParty = new Map<string, string>();
  for (const job of jobsResult.data) {
    if (!mostRecentByParty.has(job.partyId)) mostRecentByParty.set(job.partyId, job.completedAt);
  }

  const cutoff = daysAgo(RECURRING_SERVICE_DAYS);
  return [...mostRecentByParty.entries()]
    .filter(([, completedAt]) => completedAt < cutoff)
    .slice(0, MAX_PER_SIGNAL)
    .map(([partyId, completedAt]) => ({
      partyId,
      partyName: "",
      reason: "recurring_service" as const,
      detail: `Last service completed ${completedAt.slice(0, 10)}`,
      suggestedAction: "Check if they're due for service again",
    }));
}

/**
 * CRM-12.7's "Reactivation Opportunities" -- detects four signals (verbatim from the
 * backlog) and returns a suggested action for each, never an automatic send. Each
 * detector runs its own query (kept separate rather than one giant query, since the
 * four signals share no common table/shape); party names are resolved once at the end
 * for whichever parties actually matched something, rather than each detector doing its
 * own lookup.
 */
export async function listReactivationOpportunities(businessId: string): Promise<ReactivationOpportunity[]> {
  const [inactive, renewedLeads, restockedInterest, recurringService] = await Promise.all([
    detectInactiveCustomers(businessId),
    detectRenewedLeads(businessId),
    detectRestockedInterest(businessId),
    detectRecurringServiceNeed(businessId),
  ]);
  const opportunities = [...inactive, ...renewedLeads, ...restockedInterest, ...recurringService];
  if (opportunities.length === 0) return [];

  const core = await createCoreClient({ schema: "core" });
  const partyIds = [...new Set(opportunities.map((o) => o.partyId))];
  const { data: parties, error } = await core.from("parties").select("id, name").in("id", partyIds);
  if (error) throw error;
  const nameByPartyId = new Map(parties.map((p) => [p.id, p.name]));

  return opportunities.map((o) => ({ ...o, partyName: nameByPartyId.get(o.partyId) ?? "Unknown" }));
}
