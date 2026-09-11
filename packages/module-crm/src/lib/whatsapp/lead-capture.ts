import type { SupabaseClient } from "@supabase/supabase-js";
import { createParty } from "@cofounderai/core/parties/mutations";
import { createLead } from "../leads/mutations";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export type CaptureLeadResult = { leadId: string; partyId: string; alreadyCaptured: boolean; createdParty: boolean };

/**
 * CRM-07.11's "WhatsApp Lead Capture": every inbound WhatsApp message from a sender with
 * no open lead of its own becomes a real `crm.lead`, automatically, no human step
 * required to notice a new contact reached out. Dedup key is `(business_id,
 * source_module='whatsapp', source_reference=<sender's WhatsApp id>)` -- the same
 * upfront-check-then-unique-violation-catch shape `leads/mutations.ts#promoteProspectToLead()`
 * already established for CRM-03.1, so a second message from the same number never
 * creates a second lead, race included.
 *
 * A matched sender (CRM-06.4 already resolved `partyId` via `conversation_participant`/
 * `interaction` history or an exact phone match) just gets a lead against that party. An
 * unmatched sender -- CRM-06.4 deliberately never creates a party for one, its own tier 5
 * being "create new party only with user-controlled confirmation" -- is different here on
 * purpose: a real, verified WhatsApp phone number messaging the business directly carries
 * none of tier 5's "might silently merge into the wrong existing contact" risk (there's no
 * existing party being second-guessed, only a brand-new one), so this function creates one
 * itself. The new party is also written onto the conversation/participant rows so CRM-06.4's
 * own "a human resolving the match later just sets conversation.party_id" already holds --
 * except here the resolution already happened, automatically, which is the whole point of
 * this story.
 */
export async function captureLeadFromWhatsAppMessage(
  businessId: string,
  input: { partyId: string | null; externalActorId: string; senderPhone: string },
  clients: { crm: SupabaseClient; core: SupabaseClient },
): Promise<CaptureLeadResult> {
  const { data: existing, error: existingError } = await clients.crm
    .from("lead")
    .select("id, party_id")
    .eq("business_id", businessId)
    .eq("source_module", "whatsapp")
    .eq("source_reference", input.externalActorId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { leadId: existing.id, partyId: existing.party_id, alreadyCaptured: true, createdParty: false };

  let partyId = input.partyId;
  let createdParty = false;
  if (!partyId) {
    const party = await createParty({ businessId, kind: "person", name: `WhatsApp ${input.senderPhone}`, phone: input.senderPhone }, clients.core);
    partyId = party.id;
    createdParty = true;
  }

  try {
    const lead = await createLead(businessId, { partyId, source: "whatsapp", sourceModule: "whatsapp", sourceReference: input.externalActorId }, clients.crm);
    return { leadId: lead.id, partyId, alreadyCaptured: false, createdParty };
  } catch (err) {
    if ((err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
      const { data: racedExisting, error: racedError } = await clients.crm
        .from("lead")
        .select("id, party_id")
        .eq("business_id", businessId)
        .eq("source_module", "whatsapp")
        .eq("source_reference", input.externalActorId)
        .single();
      if (racedError) throw racedError;
      return { leadId: racedExisting.id, partyId: racedExisting.party_id, alreadyCaptured: true, createdParty };
    }
    throw err;
  }
}
