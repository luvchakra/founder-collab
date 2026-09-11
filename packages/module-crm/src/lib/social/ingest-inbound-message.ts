import { createAdminClient } from "@cofounderai/core/db/admin";
import { getConnectedChannelAccountByExternalId } from "../channel-accounts/queries";
import { recordInteraction } from "../interactions/mutations";

export type SocialProvider = "instagram" | "facebook_messenger";

export type IngestSocialResult =
  | { ok: true; interactionId: string; conversationId: string }
  | { ok: false; reason: "unknown_external_account_id"; provider: SocialProvider; externalAccountId: string }
  | { ok: false; reason: "empty_message" };

/**
 * CRM-08.2/08.3's webhook ingest for the new provider-neutral model (`crm.interaction`/
 * `crm.conversation`), replacing `tickets/ingest-inbound-message.ts#ingestInboundCrmMessage()`
 * for Instagram DM and Facebook Messenger specifically -- the same one-story-at-a-time
 * retirement pattern CRM-07.3 already applied to WhatsApp (docs/design/
 * crm-backlog-audit.md's retirement table).
 *
 * Deliberately reuses `crm.channel_accounts` (unretired for these two providers -- no
 * story in the required sequence charters a new `channel_connection`-based connect flow
 * for Instagram/Facebook, and CRM-08.2/08.3's own acceptance criteria only ask for the
 * inbound mapping, not a new connection mechanism) purely as the webhook's own tenant
 * resolution lookup (`getConnectedChannelAccountByExternalId()`, already admin-scoped for
 * exactly this "no session" reason) -- once the owning business is known, everything
 * downstream (`recordInteraction()`) writes to the new model, not `crm.tickets`.
 *
 * Deliberately drops the old function's `instant_reply_mode` auto-reply/auto-routing
 * behavior: CRM-08.2/08.3's own acceptance criteria don't ask for either, and the
 * platform's post-CRM-09 direction is human-in-the-loop by design (CRM-09.6's own "draft
 * only, no auto-send"; backlog rule #11) -- an unconditional automatic reply on first
 * contact would cut against that, not merely be an unbuilt nice-to-have. Auto-routing on
 * ingest is the same already-accepted gap CRM-07.3/07.4 left for WhatsApp (CRM-06.3's own
 * "Conversation Assignment" is manual/audited, not rule-based-on-ingest).
 */
export async function ingestInboundSocialMessage(input: {
  provider: SocialProvider;
  externalAccountId: string;
  senderHandle: string;
  text: string;
  occurredAt?: string;
}): Promise<IngestSocialResult> {
  const senderHandle = input.senderHandle.trim();
  const text = input.text.trim();
  if (!senderHandle || !text) return { ok: false, reason: "empty_message" };

  const account = await getConnectedChannelAccountByExternalId(input.provider, input.externalAccountId);
  if (!account) {
    return { ok: false, reason: "unknown_external_account_id", provider: input.provider, externalAccountId: input.externalAccountId };
  }

  const crmAdmin = createAdminClient({ schema: "crm" });
  const coreAdmin = createAdminClient({ schema: "core" });

  // CRM-08.2/08.3's own acceptance criteria, in order: map to interaction + conversation
  // (this call), reuse party matching (recordInteraction()'s own CRM-06.4 hierarchy,
  // triggered because externalActorId is set and no partyId is given -- there's no phone/
  // email to match on for either provider, so it resolves via a prior interaction/
  // conversation_participant or stays party-less, same as an unresolved WhatsApp sender),
  // add requires_response as needed (recordInteraction()'s own CRM-09.1 rules engine --
  // neither provider is in SUPPORTED_RESPONSE_CHANNELS yet, since no send-reply story for
  // either exists in the required sequence, so this correctly evaluates to false today).
  const interaction = await recordInteraction(
    account.business_id,
    {
      channel: input.provider,
      externalActorId: senderHandle,
      direction: "inbound",
      occurredAt: input.occurredAt,
      contentExcerpt: text,
      sourceModule: input.provider,
    },
    { crm: crmAdmin, core: coreAdmin },
  );

  return { ok: true, interactionId: interaction.id, conversationId: interaction.conversation_id };
}
