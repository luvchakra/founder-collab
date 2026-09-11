import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import type { FollowUp, FollowUpQueueRow } from "./types";

/** CRM-01.3's `listOpenFollowUps()` contract operation. The full queue UI (due today /
 * overdue / upcoming / unassigned / high-priority views, filters) is CRM-05.3's own
 * story -- this returns pending follow-ups ordered soonest-due-first, the one shape
 * every one of those views is filtered from. */
export async function listOpenFollowUps(businessId: string, ownerId?: string): Promise<FollowUp[]> {
  const supabase = await createClient();
  let query = supabase.from("follow_up").select("*").eq("business_id", businessId).eq("status", "pending").order("due_at", { ascending: true });
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query;
  if (error) throw error;
  return data as FollowUp[];
}

/** Opportunity detail page's own Follow-ups section (CRM-05.3) -- this one entity's
 * pending follow-ups, soonest due first. */
export async function listFollowUpsForOpportunity(businessId: string, opportunityId: string): Promise<FollowUp[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follow_up")
    .select("*")
    .eq("business_id", businessId)
    .eq("opportunity_id", opportunityId)
    .eq("status", "pending")
    .order("due_at", { ascending: true });
  if (error) throw error;
  return data as FollowUp[];
}

/**
 * CRM-05.3's queue: every pending follow-up, enriched with the party name and the
 * source/channel of whichever entity it's attached to. A follow-up's own `party_id` is
 * often unset when it's attached via `lead_id`/`opportunity_id`/`conversation_id`
 * instead (see the RLS harness's own follow_up inserts), so the party is resolved
 * through whichever reference is present -- own party_id first, then the lead's,
 * opportunity's, or conversation's. View/filter logic (due today, overdue, high-priority,
 * etc.) is applied by the caller against this one list, not baked into separate queries
 * per view.
 */
export async function listFollowUpQueue(businessId: string): Promise<FollowUpQueueRow[]> {
  const supabase = await createClient();
  const { data: followUps, error } = await supabase
    .from("follow_up")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "pending")
    .order("due_at", { ascending: true });
  if (error) throw error;
  if (followUps.length === 0) return [];

  const leadIds = [...new Set(followUps.map((f) => f.lead_id).filter((id): id is string => Boolean(id)))];
  const opportunityIds = [...new Set(followUps.map((f) => f.opportunity_id).filter((id): id is string => Boolean(id)))];
  const conversationIds = [...new Set(followUps.map((f) => f.conversation_id).filter((id): id is string => Boolean(id)))];

  const [{ data: leads, error: leadsError }, { data: opportunities, error: opportunitiesError }, { data: conversations, error: conversationsError }] =
    await Promise.all([
      leadIds.length
        ? supabase.from("lead").select("id, party_id, source").in("id", leadIds)
        : Promise.resolve({ data: [] as { id: string; party_id: string; source: string }[], error: null }),
      opportunityIds.length
        ? supabase.from("opportunity").select("id, party_id, source").in("id", opportunityIds)
        : Promise.resolve({ data: [] as { id: string; party_id: string; source: string }[], error: null }),
      conversationIds.length
        ? supabase.from("conversation").select("id, party_id, primary_channel").in("id", conversationIds)
        : Promise.resolve({ data: [] as { id: string; party_id: string | null; primary_channel: string }[], error: null }),
    ]);
  if (leadsError) throw leadsError;
  if (opportunitiesError) throw opportunitiesError;
  if (conversationsError) throw conversationsError;

  const leadById = new Map(leads.map((l) => [l.id, l]));
  const opportunityById = new Map(opportunities.map((o) => [o.id, o]));
  const conversationById = new Map(conversations.map((c) => [c.id, c]));

  const partyIds = new Set<string>();
  for (const f of followUps) {
    const resolved = f.party_id ?? leadById.get(f.lead_id ?? "")?.party_id ?? opportunityById.get(f.opportunity_id ?? "")?.party_id ?? conversationById.get(f.conversation_id ?? "")?.party_id;
    if (resolved) partyIds.add(resolved);
  }
  const core = await createCoreClient({ schema: "core" });
  const { data: parties, error: partiesError } = partyIds.size
    ? await core.from("parties").select("id, name").in("id", [...partyIds])
    : { data: [] as { id: string; name: string }[], error: null };
  if (partiesError) throw partiesError;
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));

  return followUps.map((f) => {
    const lead = f.lead_id ? leadById.get(f.lead_id) : undefined;
    const opportunity = f.opportunity_id ? opportunityById.get(f.opportunity_id) : undefined;
    const conversation = f.conversation_id ? conversationById.get(f.conversation_id) : undefined;
    const resolvedPartyId = f.party_id ?? lead?.party_id ?? opportunity?.party_id ?? conversation?.party_id ?? null;
    return {
      ...(f as FollowUp),
      partyName: resolvedPartyId ? (partyNameById.get(resolvedPartyId) ?? null) : null,
      source: lead?.source ?? opportunity?.source ?? null,
      channel: conversation?.primary_channel ?? null,
    };
  });
}
