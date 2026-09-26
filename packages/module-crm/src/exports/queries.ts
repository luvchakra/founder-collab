import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { fetchAllRows } from "@cofounderai/core/exports/fetch-all";
import { createClient } from "../db/server";
import { computeConversationFlags, type ConversationQueueRow } from "../lib/conversations/queue";
import type { Conversation } from "../lib/conversations/types";
import { enrichFollowUpQueue } from "../lib/follow-ups/queries";
import type { FollowUp, FollowUpQueueRow } from "../lib/follow-ups/types";
import { buildPotentialLostBusinessQueue, type PotentialLostBusinessQueueEntry } from "../lib/interactions/queries";
import type { Interaction } from "../lib/interactions/types";
import type { Lead } from "../lib/leads/types";
import type { Opportunity } from "../lib/opportunities/types";
import type { ReviewItem } from "../lib/reviews/types";

/**
 * EXP-CRM-01..10 -- export-only reads (§36, rule 1 of docs/design/data-exports.md).
 *
 * Every CRM page's own loader is an unbounded `select()`, so PostgREST quietly stops at
 * its 1,000-row cap; the Lost Business queue is capped at 200 on purpose. These apply
 * exactly the same predicates as the page's loader, page through with `fetchAllRows`
 * in a stable order ending in `id`, and do their lookups in bounded batches so an
 * `in (...)` list never grows past a few hundred ids. The tenant is always the
 * `businessId` the export route resolved from the session, never a request parameter.
 */

/** Ids per `.in()` lookup -- keeps each request URL well inside proxy limits. */
export const LOOKUP_BATCH = 200;

export function batches<T>(items: T[], size = LOOKUP_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type ExportParty = { id: string; name: string; kind: string; email: string | null; phone: string | null };

/** `core.parties` rows for the given ids, within this business only. */
export async function listPartiesForExport(businessId: string, partyIds: string[]): Promise<Map<string, ExportParty>> {
  const ids = [...new Set(partyIds.filter(Boolean))];
  const byId = new Map<string, ExportParty>();
  if (ids.length === 0) return byId;
  const core = await createCoreClient({ schema: "core" });
  for (const batch of batches(ids)) {
    const { data, error } = await core.from("parties").select("id, name, kind, email, phone").eq("business_id", businessId).in("id", batch);
    if (error) throw error;
    for (const party of (data ?? []) as ExportParty[]) byId.set(party.id, party);
  }
  return byId;
}

/** EXP-CRM-02: `listLeads()`'s predicates, every row. */
export async function listLeadsForExport(businessId: string): Promise<Lead[]> {
  const supabase = await createClient();
  return fetchAllRows<Lead>((from, to) =>
    supabase
      .from("lead")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** EXP-CRM-01/03: `listOpportunities()`'s predicates, every row. */
export async function listOpportunitiesForExport(businessId: string): Promise<Opportunity[]> {
  const supabase = await createClient();
  return fetchAllRows<Opportunity>((from, to) =>
    supabase
      .from("opportunity")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** EXP-CRM-08: `listReviewItems()`'s predicates, every row. */
export async function listReviewItemsForExport(businessId: string): Promise<ReviewItem[]> {
  const supabase = await createClient();
  return fetchAllRows<ReviewItem>((from, to) =>
    supabase
      .from("review_item")
      .select("*")
      .eq("business_id", businessId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** EXP-CRM-07: `listFollowUpQueue()` -- every pending follow-up, enriched exactly as the
 * page enriches them, a bounded batch at a time. */
export async function listFollowUpQueueForExport(businessId: string): Promise<FollowUpQueueRow[]> {
  const supabase = await createClient();
  const followUps = await fetchAllRows<FollowUp>((from, to) =>
    supabase
      .from("follow_up")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .order("due_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const rows: FollowUpQueueRow[] = [];
  for (const batch of batches(followUps)) rows.push(...(await enrichFollowUpQueue(businessId, batch)));
  return rows;
}

/** EXP-CRM-01/05: `getOpenCommercialInteractions()`'s predicates without the page's
 * 200-row cap, joined exactly as `listPotentialLostBusinessQueue()` joins them. */
export async function listPotentialLostBusinessQueueForExport(businessId: string): Promise<PotentialLostBusinessQueueEntry[]> {
  const supabase = await createClient();
  const interactions = await fetchAllRows<Interaction>((from, to) =>
    supabase
      .from("interaction")
      .select("*")
      .eq("business_id", businessId)
      .eq("requires_response", true)
      .is("responded_at", null)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const rows: PotentialLostBusinessQueueEntry[] = [];
  for (const batch of batches(interactions)) rows.push(...(await buildPotentialLostBusinessQueue(batch)));
  return rows;
}

type FlagInteraction = {
  id: string;
  conversation_id: string;
  requires_response: boolean;
  responded_at: string | null;
  response_due_at: string | null;
  intent_confidence: number | null;
};

/** EXP-CRM-09: `listConversationQueue()` -- every conversation with the same
 * needs-response/overdue/high-intent flags, computed from *all* of each conversation's
 * interactions (paged), not the first 1,000 across the business. */
export async function listConversationQueueForExport(businessId: string, now = new Date()): Promise<ConversationQueueRow[]> {
  const supabase = await createClient();
  const conversations = await fetchAllRows<Conversation>((from, to) =>
    supabase
      .from("conversation")
      .select("*")
      .eq("business_id", businessId)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (conversations.length === 0) return [];

  const interactionsByConversation = new Map<string, FlagInteraction[]>();
  for (const batch of batches(conversations.map((c) => c.id), 100)) {
    const interactions = await fetchAllRows<FlagInteraction>((from, to) =>
      supabase
        .from("interaction")
        .select("id, conversation_id, requires_response, responded_at, response_due_at, intent_confidence")
        .eq("business_id", businessId)
        .in("conversation_id", batch)
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const interaction of interactions) {
      const list = interactionsByConversation.get(interaction.conversation_id) ?? [];
      list.push(interaction);
      interactionsByConversation.set(interaction.conversation_id, list);
    }
  }

  const parties = await listPartiesForExport(
    businessId,
    conversations.map((c) => c.party_id).filter((id): id is string => Boolean(id)),
  );

  return conversations.map((conversation) => ({
    ...conversation,
    partyName: conversation.party_id ? (parties.get(conversation.party_id)?.name ?? null) : null,
    ...computeConversationFlags(
      (interactionsByConversation.get(conversation.id) ?? []).map((i) => ({
        requiresResponse: i.requires_response,
        respondedAt: i.responded_at,
        responseDueAt: i.response_due_at,
        intentConfidence: i.intent_confidence,
      })),
      now,
    ),
  }));
}

/** One message of a conversation, as an export may carry it: the text the inbox already
 * shows (`content_excerpt`) and the provider's delivery status -- never the raw
 * `metadata` object, `media_reference`, `content_reference` or provider ids. */
export type ExportMessage = {
  id: string;
  direction: "inbound" | "outbound";
  channel: string;
  interaction_type: string;
  occurred_at: string;
  content_excerpt: string | null;
  status: string;
  provider_status: string | null;
};

/** EXP-CRM-09: every message of one conversation -- `getConversationById()`'s
 * interaction read, paged, and only the columns listed on `ExportMessage`. Returns
 * `null` when the conversation isn't this business's. */
export async function getConversationMessagesForExport(
  businessId: string,
  conversationId: string,
): Promise<{ conversation: Conversation; messages: ExportMessage[] } | null> {
  const supabase = await createClient();
  const { data: conversation, error } = await supabase
    .from("conversation")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!conversation) return null;

  const messages = await fetchAllRows<ExportMessage>((from, to) =>
    supabase
      .from("interaction")
      .select("id, direction, channel, interaction_type, occurred_at, content_excerpt, status, provider_status:metadata->>providerStatus")
      .eq("business_id", businessId)
      .eq("conversation_id", conversationId)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return { conversation: conversation as Conversation, messages };
}
