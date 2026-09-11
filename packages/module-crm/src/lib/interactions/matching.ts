import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import type { ChannelType } from "../conversations/types";

export type PartyMatchTier = "known_external_id" | "contact_exact" | "unmatched";

export type PartyMatchResult = { partyId: string | null; matchTier: PartyMatchTier };

export type PartyMatchInput = {
  channel: ChannelType;
  externalActorId?: string | null;
  phone?: string | null;
  email?: string | null;
};

/**
 * CRM-06.4's match hierarchy, collapsed from the backlog's five tiers to three this
 * schema can actually support without inventing an unused signal:
 *
 * 1. `known_external_id` -- backlog tiers 1 ("verified external party/contact mapping")
 *    and 3 ("channel-specific external ID") collapse into one lookup here: this exact
 *    (business, external_actor_id) has already been linked to a party, either through a
 *    `crm.conversation_participant` row or a prior `crm.interaction`. Nothing in this
 *    schema yet distinguishes a deliberately-verified link from one that simply
 *    recurred -- adding a fake "verified" flag no UI ever sets would be worse than
 *    naming the collapse honestly. A future story can split this tier again once there's
 *    a real verification action to back it.
 * 2. `contact_exact` -- backlog tier 2: an exact phone or email match against
 *    `core.parties`. Two separate `.eq()` queries, not a single `.or()` filter --
 *    `phone`/`email` here can originate from an external channel payload, and
 *    PostgREST's `.or()` syntax is a string filter language, not parameterized, so
 *    building one from untrusted input risks filter injection.
 * 3. `unmatched` -- backlog tier 4 ("manual match"): no automatic signal found.
 *
 * Backlog tier 5 ("create new party only with user-controlled confirmation") is
 * deliberately not this function's job -- it never creates a party. Turning an
 * `unmatched` result into a real `core.parties` row (or into a conversation that exists
 * without one, as an "unresolved contact candidate") is CRM-07.4's own acceptance
 * criterion once a live inbound channel exists to drive it, not this story's schema-only
 * matching logic.
 */
export async function matchPartyForActor(businessId: string, input: PartyMatchInput): Promise<PartyMatchResult> {
  const supabase = await createClient();

  if (input.externalActorId) {
    const { data: participant, error: participantError } = await supabase
      .from("conversation_participant")
      .select("party_id")
      .eq("business_id", businessId)
      .eq("external_actor_id", input.externalActorId)
      .not("party_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (participantError) throw participantError;
    if (participant?.party_id) return { partyId: participant.party_id, matchTier: "known_external_id" };

    const { data: priorInteraction, error: interactionError } = await supabase
      .from("interaction")
      .select("party_id")
      .eq("business_id", businessId)
      .eq("channel", input.channel)
      .eq("external_actor_id", input.externalActorId)
      .not("party_id", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (interactionError) throw interactionError;
    if (priorInteraction?.party_id) return { partyId: priorInteraction.party_id, matchTier: "known_external_id" };
  }

  if (input.phone || input.email) {
    const core = await createCoreClient({ schema: "core" });
    if (input.phone) {
      const { data: byPhone, error: phoneError } = await core.from("parties").select("id").eq("business_id", businessId).eq("phone", input.phone).limit(1).maybeSingle();
      if (phoneError) throw phoneError;
      if (byPhone) return { partyId: byPhone.id, matchTier: "contact_exact" };
    }
    if (input.email) {
      const { data: byEmail, error: emailError } = await core.from("parties").select("id").eq("business_id", businessId).eq("email", input.email).limit(1).maybeSingle();
      if (emailError) throw emailError;
      if (byEmail) return { partyId: byEmail.id, matchTier: "contact_exact" };
    }
  }

  return { partyId: null, matchTier: "unmatched" };
}
