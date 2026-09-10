import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { createParty } from "@cofounderai/core/parties/mutations";
import { createAdminClient } from "../../db/admin";
import { getConnectedChannelAccountByExternalId } from "../channel-accounts/queries";
import { sendCrmChannelMessage } from "../channel-accounts/send-message";
import type { ChannelProvider } from "../channel-accounts/types";
import { findMatchingRule } from "../routing-rules/evaluate";
import type { RoutingRule } from "../routing-rules/types";
import { classifyIntent, type DetectedIntent } from "../ai/classify-intent";
import { draftReply } from "../ai/draft-reply";
import type { Ticket } from "./types";

export type InboundCrmMessagePayload = {
  provider: ChannelProvider;
  /** The page/phone-number/location id on the provider's side that received the
   * message -- how a webhook with no session resolves which business/channel this
   * belongs to (see channel-accounts/queries.ts#getConnectedChannelAccountByExternalId). */
  externalAccountId: string;
  /** The sender's own provider-side id -- a real phone number for WhatsApp, an
   * opaque user id for Instagram/Facebook/Google Business Messages. */
  senderHandle: string;
  senderName?: string | null;
  text: string;
};

export type IngestResult =
  | { matched: true; ticket: Ticket; messageId: string; isNewTicket: boolean; channelAccountId: string }
  | { matched: false; reason: string };

/**
 * Normalizes one inbound provider message into crm.tickets + core.threads/messages
 * (docs/design/crm-module-design.md Part A, A2) -- the same shared messaging tables
 * FSM and Discovery already read/write (core.messages's own migration: "this isn't a
 * fourth parallel inbox implementation"), so a Customer 360 panel or any other reader
 * doesn't need a CRM-specific message store.
 *
 * Runs with admin clients (no logged-in user in a webhook request), doing its own
 * tenant resolution from the provider's own externalAccountId -- same shape as
 * module-discovery/lib/conversations/ingest-inbound-email.ts's contact-address lookup.
 */
export async function ingestInboundCrmMessage(payload: InboundCrmMessagePayload): Promise<IngestResult> {
  const senderHandle = payload.senderHandle.trim();
  const text = payload.text.trim();
  if (!senderHandle || !text) return { matched: false, reason: "Missing sender or message text." };

  const account = await getConnectedChannelAccountByExternalId(payload.provider, payload.externalAccountId);
  if (!account) {
    return { matched: false, reason: `No connected ${payload.provider} account for ${payload.externalAccountId}.` };
  }

  const crm = createAdminClient();
  const core = createCoreAdminClient({ schema: "core" });

  // B3/A3 (docs/design/crm-module-design.md): a heuristic guess at the sender's intent
  // (lib/ai/classify-intent.ts's own docstring explains why this isn't a real AI call
  // yet), used below both to pick a routing rule with a matching `detected_intent_filter`
  // and, for `draft_approve` accounts, to pick which canned draft to show an agent.
  const detectedIntent: DetectedIntent = classifyIntent(text);

  // Same sender writing again on an already-open ticket appends to it rather than
  // opening a duplicate -- matched on the provider-side handle since a party isn't
  // guaranteed to exist yet (see findOrCreateParty below).
  const { data: openTicket, error: openTicketError } = await crm
    .from("tickets")
    .select("*")
    .eq("business_id", account.business_id)
    .eq("channel_id", account.channel_id)
    .eq("external_sender_handle", senderHandle)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openTicketError) throw openTicketError;

  let ticket = openTicket as Ticket | null;
  let isNewTicket = false;

  if (!ticket) {
    const { partyId, isKnownSender } = await findOrCreateParty(
      account.business_id,
      payload.provider,
      senderHandle,
      payload.senderName ?? null,
      crm,
      core,
    );
    const label = payload.senderName || senderHandle;
    const assignToEmployeeId = await matchRoutingRule(
      crm,
      core,
      account.business_id,
      account.channel_id,
      isKnownSender,
      detectedIntent,
    );

    const { data: created, error: createError } = await crm
      .from("tickets")
      .insert({
        business_id: account.business_id,
        channel_id: account.channel_id,
        party_id: partyId,
        external_sender_handle: senderHandle,
        assigned_to: assignToEmployeeId,
        subject: `${label} via ${payload.provider}`,
        status: "open",
      })
      .select()
      .single();
    if (createError) throw createError;
    ticket = created as Ticket;
    isNewTicket = true;

    // B4 (docs/design/crm-module-design.md Part B): emitted with the same admin
    // client used throughout this function, not core/events/mutations.ts#publish --
    // that function runs as the calling user through the RLS-scoped client
    // ("a publisher always has a real business_id it's already a member of"), which
    // this webhook-driven ingestion never has.
    await core.from("domain_events").insert({
      business_id: account.business_id,
      type: "ticket.created",
      payload: { ticketId: ticket.id, channelId: account.channel_id, provider: payload.provider },
    });
  }

  // core.threads/messages are polymorphic against (entity_type, entity_id) -- 'crm_ticket'
  // here, same pattern F-11's own job-scoped threads use with 'fsm_job'.
  const { data: existingThread, error: threadFindError } = await core
    .from("threads")
    .select("id")
    .eq("business_id", account.business_id)
    .eq("entity_type", "crm_ticket")
    .eq("entity_id", ticket.id)
    .maybeSingle();
  if (threadFindError) throw threadFindError;

  let threadId = existingThread?.id as string | undefined;
  if (!threadId) {
    const { data: newThread, error: threadCreateError } = await core
      .from("threads")
      .insert({ business_id: account.business_id, entity_type: "crm_ticket", entity_id: ticket.id, subject: ticket.subject })
      .select("id")
      .single();
    if (threadCreateError) throw threadCreateError;
    threadId = newThread.id;
  }

  const { data: message, error: messageError } = await core
    .from("messages")
    .insert({
      business_id: account.business_id,
      thread_id: threadId,
      direction: "inbound",
      channel: payload.provider,
      from_address: senderHandle,
      body: text,
      status: "received",
    })
    .select("id")
    .single();
  if (messageError) throw messageError;

  await crm.from("channel_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", account.id);

  // A3's "instant acknowledgment, then human" mode -- only on the *first* message of a
  // new conversation (a reply to an already-open ticket means a human is presumably
  // already engaged, so firing this again would look like a canned bot ignoring what
  // was just said). A fixed template, not an AI-drafted one: personalizing this would
  // need module-crm to call into module-discovery's AI routing, which is discovery-
  // schema-owned account/workspace machinery no contract currently exposes across the
  // module boundary (CLAUDE.md rule #3) -- flagged as a real follow-up rather than
  // reached around by importing discovery's internals directly.
  if (isNewTicket && account.instant_reply_mode === "instant_ack_then_human") {
    await sendInstantAcknowledgment(core, account, payload.provider, senderHandle, threadId!);
  }

  // A3's "AI drafts, human approves" mode -- inserts a draft outbound message (status
  // 'draft', never sent automatically) picked from lib/ai/draft-reply.ts's own
  // intent-keyed templates, same "not a real AI call yet" caveat as that file's
  // docstring. A human reviews it from the ticket's thread and sends it themselves
  // (there is no separate "approve" mutation today -- an agent replies normally,
  // editing or discarding the draft first) rather than anything sending on its own.
  if (isNewTicket && account.instant_reply_mode === "draft_approve") {
    await draftInstantReply(core, account.business_id, payload.provider, senderHandle, threadId!, detectedIntent);
  }

  return { matched: true, ticket, messageId: message.id, isNewTicket, channelAccountId: account.id };
}

const INSTANT_ACK_TEXT =
  "Thanks for reaching out -- someone from our team will follow up shortly. In the meantime, could you tell me a bit about what you're looking for?";

async function sendInstantAcknowledgment(
  core: ReturnType<typeof createCoreAdminClient>,
  account: { id: string; business_id: string; external_account_id: string; accessTokenEncrypted: string },
  provider: ChannelProvider,
  recipientHandle: string,
  threadId: string,
): Promise<void> {
  const result = await sendCrmChannelMessage(
    provider,
    account.external_account_id,
    account.accessTokenEncrypted,
    recipientHandle,
    INSTANT_ACK_TEXT,
  );

  // Best-effort -- a send failure (expired token, provider outage) shouldn't undo the
  // inbound message that was already safely recorded, same resilience discipline
  // module-discovery/lib/conversations/ingest-inbound-email.ts's own classification
  // step already applies to itself.
  await core.from("messages").insert({
    business_id: account.business_id,
    thread_id: threadId,
    direction: "outbound",
    channel: provider,
    to_address: recipientHandle,
    body: INSTANT_ACK_TEXT,
    status: result.ok ? "sent" : "failed",
    sent_at: result.ok ? new Date().toISOString() : null,
  });
}

async function draftInstantReply(
  core: ReturnType<typeof createCoreAdminClient>,
  businessId: string,
  provider: ChannelProvider,
  recipientHandle: string,
  threadId: string,
  detectedIntent: DetectedIntent,
): Promise<void> {
  const { data: business, error: businessError } = await core
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();
  if (businessError) throw businessError;

  const body = draftReply(detectedIntent, business?.name ?? "our team");
  const { error: insertError } = await core.from("messages").insert({
    business_id: businessId,
    thread_id: threadId,
    direction: "outbound",
    channel: provider,
    to_address: recipientHandle,
    body,
    status: "draft",
  });
  if (insertError) throw insertError;
}

/**
 * WhatsApp's handle is a real phone number, so it's matched against core.parties.phone
 * directly. The other three providers' handles are opaque platform ids with nowhere
 * structured to match against (core.party_contacts has no generic "social handle"
 * column) -- for those, this falls back to whichever party a *previous* ticket from
 * the exact same handle already resolved (e.g. via "Convert to prospect", or a future
 * order/job linking one), and only creates a fresh lead-only party when neither lookup
 * finds anything. A lead-only party carries no role yet (ADR's "one row, many roles"
 * model) -- CRM doesn't know if this sender is a prospect until something says so.
 *
 * `isKnownSender` (B3's routing condition) is true exactly when one of those two
 * lookups found something -- "has crm seen this exact handle resolve to a party
 * before," not literally "has an active fsm job or inventory order" as B3's own
 * prose puts it. Checking those directly would mean this module importing
 * module-fsm/module-inventory's contracts, which only apps/web's composition root
 * may do (CLAUDE.md rule #3) -- a real, intentional narrowing of scope, not an
 * oversight.
 */
async function findOrCreateParty(
  businessId: string,
  provider: ChannelProvider,
  senderHandle: string,
  senderName: string | null,
  crm: ReturnType<typeof createAdminClient>,
  core: ReturnType<typeof createCoreAdminClient>,
): Promise<{ partyId: string | null; isKnownSender: boolean }> {
  if (provider === "whatsapp_business") {
    const { data: existing, error } = await core
      .from("parties")
      .select("id")
      .eq("business_id", businessId)
      .eq("phone", senderHandle)
      .maybeSingle();
    if (error) throw error;
    if (existing) return { partyId: existing.id, isKnownSender: true };
  }

  const { data: priorTicket, error: priorError } = await crm
    .from("tickets")
    .select("party_id")
    .eq("business_id", businessId)
    .eq("external_sender_handle", senderHandle)
    .not("party_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priorError) throw priorError;
  if (priorTicket?.party_id) return { partyId: priorTicket.party_id, isKnownSender: true };

  const created = await createParty(
    {
      businessId,
      kind: "person",
      name: senderName || senderHandle,
      phone: provider === "whatsapp_business" ? senderHandle : null,
    },
    core,
  );
  return { partyId: created.id, isKnownSender: false };
}

/** Auto-assigns a newly created ticket per B3's routing rules -- reads both
 * crm.routing_rules and core.business_settings.timezone through the admin clients
 * already open in this webhook context (routing-rules/queries.ts#listRoutingRules is
 * RLS-scoped and would return nothing here, same reason channel-accounts/queries.ts
 * needed its own admin lookup). Returns null (no assignment) if nothing matches --
 * a ticket with no matching rule stays unassigned, same as one created manually. */
async function matchRoutingRule(
  crm: ReturnType<typeof createAdminClient>,
  core: ReturnType<typeof createCoreAdminClient>,
  businessId: string,
  channelId: string,
  isKnownSender: boolean,
  detectedIntent: DetectedIntent,
): Promise<string | null> {
  const [{ data: rules, error: rulesError }, { data: settings, error: settingsError }] = await Promise.all([
    crm.from("routing_rules").select("*").eq("business_id", businessId).eq("is_active", true),
    core.from("business_settings").select("timezone").eq("business_id", businessId).maybeSingle(),
  ]);
  if (rulesError) throw rulesError;
  if (settingsError) throw settingsError;
  if (!rules || rules.length === 0) return null;

  const match = findMatchingRule(
    rules as RoutingRule[],
    { channelId, isKnownSender, detectedIntent },
    settings?.timezone ?? "Asia/Kolkata",
  );
  return match?.assign_to_employee_id ?? null;
}
