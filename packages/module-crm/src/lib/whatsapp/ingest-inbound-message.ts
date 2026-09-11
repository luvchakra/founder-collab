import { createAdminClient } from "@cofounderai/core/db/admin";
import { recordInteraction, markInteractionFailed } from "../interactions/mutations";
import { captureLeadFromWhatsAppMessage } from "./lead-capture";
import { parseWhatsAppWebhookPayload } from "./cloud-api-adapter";
import type { WhatsAppWebhookEvent } from "./types";

type WhatsAppEntryChange = { field?: string; value?: { metadata?: { phone_number_id?: string } } };
type WhatsAppWebhookPayload = { entry?: { changes?: WhatsAppEntryChange[] }[] };

export type IngestWhatsAppResult =
  | { ok: true; kind: "message"; interactionId: string; conversationId: string; leadId: string }
  | { ok: true; kind: "status"; externalMessageId: string; matched: boolean }
  | { ok: false; reason: "unknown_phone_number_id"; phoneNumberId: string };

/**
 * CRM-07.3's webhook ingest function for the new provider-neutral model (`crm.interaction`
 * / `crm.conversation`), replacing `tickets/ingest-inbound-message.ts#ingestInboundCrmMessage()`
 * for this one channel per the retirement table -- `verify-meta-signature.ts` and the route's
 * GET subscription-handshake handler are unaffected (reused as-is).
 *
 * A webhook request has no logged-in user to back the RLS-scoped clients every other caller
 * of `recordInteraction()`/`markInteractionFailed()` uses, so this is the one place in CRM
 * that reaches for `createAdminClient()` (service-role, bypasses RLS) -- same trust boundary
 * the old ticket-based ingest function already used for the identical reason. Each raw
 * payload is walked change-by-change (rather than trusting `parseWhatsAppWebhookPayload()`'s
 * own flattened event list) because that pure parser deliberately drops `metadata.
 * phone_number_id` -- the one thing this function needs to resolve *which business* a change
 * belongs to -- so each change is re-wrapped into its own single-change payload and handed to
 * the same parser, keeping the parsing logic itself in one place.
 */
export async function ingestInboundWhatsAppMessage(rawPayload: unknown): Promise<IngestWhatsAppResult[]> {
  const payload = rawPayload as WhatsAppWebhookPayload;
  const crmAdmin = createAdminClient({ schema: "crm" });
  const coreAdmin = createAdminClient({ schema: "core" });
  const results: IngestWhatsAppResult[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const events = parseWhatsAppWebhookPayload({ entry: [{ changes: [change] }] });
      if (events.length === 0) continue;

      const { data: connection, error: connectionError } = await crmAdmin
        .from("channel_connection")
        .select("business_id")
        .eq("channel", "whatsapp")
        .eq("provider", "whatsapp_cloud_api")
        .eq("external_account_id", phoneNumberId)
        .maybeSingle();
      if (connectionError) throw connectionError;

      if (!connection) {
        // Same "don't make Meta retry forever over an account we don't recognize"
        // reasoning as the old route's own handling of an unmatched account.
        results.push({ ok: false, reason: "unknown_phone_number_id", phoneNumberId });
        continue;
      }

      for (const event of events) {
        results.push(await ingestEvent(connection.business_id, event, crmAdmin, coreAdmin));
      }
    }
  }

  return results;
}

async function ingestEvent(
  businessId: string,
  event: WhatsAppWebhookEvent,
  crmAdmin: ReturnType<typeof createAdminClient>,
  coreAdmin: ReturnType<typeof createAdminClient>,
): Promise<IngestWhatsAppResult> {
  if (event.kind === "message") {
    // CRM-07.4 ("Receive WhatsApp Text Messages"): `recordInteraction()` already does
    // everything this needs -- CRM-06.4 party matching by phone, find-or-create the
    // conversation (including the party-less "unresolved contact candidate" path for a
    // still-unmatched sender). `requiresResponse` is left unset deliberately (CRM-09.1):
    // `recordInteraction()`'s own deterministic rules engine decides, rather than every
    // inbound WhatsApp message being flagged unconditionally regardless of content.
    const interaction = await recordInteraction(
      businessId,
      {
        channel: "whatsapp",
        externalActorId: event.externalActorId,
        senderPhone: event.senderPhone,
        externalMessageId: event.externalMessageId,
        direction: "inbound",
        occurredAt: event.occurredAt,
        contentExcerpt: event.text,
        mediaReference: event.mediaId,
        sourceModule: "whatsapp",
        metadata: event.mediaId ? { mediaId: event.mediaId } : {},
      },
      { crm: crmAdmin, core: coreAdmin },
    );

    // CRM-07.11: every inbound message gets a lead if one doesn't already exist for this
    // WhatsApp sender -- see lead-capture.ts's own doc comment for why an unmatched
    // sender getting a brand-new party here is safe in a way CRM-06.4's tier 5 isn't.
    const capture = await captureLeadFromWhatsAppMessage(
      businessId,
      { partyId: interaction.party_id, externalActorId: event.externalActorId, senderPhone: event.senderPhone },
      { crm: crmAdmin, core: coreAdmin },
    );
    if (capture.createdParty && !interaction.party_id) {
      await crmAdmin.from("conversation").update({ party_id: capture.partyId }).eq("id", interaction.conversation_id).is("party_id", null);
      await crmAdmin
        .from("conversation_participant")
        .update({ party_id: capture.partyId })
        .eq("conversation_id", interaction.conversation_id)
        .eq("external_actor_id", event.externalActorId)
        .is("party_id", null);
    }

    return { ok: true, kind: "message", interactionId: interaction.id, conversationId: interaction.conversation_id, leadId: capture.leadId };
  }

  // event.kind === "status": find the outbound interaction this status belongs to by its
  // provider message id -- a status push has no business_id of its own, but the connection
  // we already resolved narrows it to one business's rows.
  const { data: existing, error: existingError } = await crmAdmin
    .from("interaction")
    .select("id")
    .eq("business_id", businessId)
    .eq("channel", "whatsapp")
    .eq("external_message_id", event.externalMessageId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (!existing) return { ok: true, kind: "status", externalMessageId: event.externalMessageId, matched: false };

  if (event.status === "failed") {
    await markInteractionFailed(businessId, existing.id, "WhatsApp reported this message as failed.", { crm: crmAdmin, core: coreAdmin });
  } else {
    // sent/delivered/read: recorded on the row for now; a dedicated read-back UI for
    // delivery status is CRM-07.9's own future job, not this story's.
    const { data: current, error: currentError } = await crmAdmin.from("interaction").select("metadata").eq("id", existing.id).single();
    if (currentError) throw currentError;
    const { error: updateError } = await crmAdmin
      .from("interaction")
      .update({ metadata: { ...current.metadata, providerStatus: event.status } })
      .eq("id", existing.id);
    if (updateError) throw updateError;
  }

  return { ok: true, kind: "status", externalMessageId: event.externalMessageId, matched: true };
}
