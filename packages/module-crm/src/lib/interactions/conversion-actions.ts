import { createClient } from "../../db/server";
import { createActivity } from "../activities/mutations";
import { createLead, convertLeadToOpportunity } from "../leads/mutations";

/**
 * CRM-09.5's "One-click Convert to Lead/Opportunity" -- the backlog's exact action set
 * from an unanswered message: `Respond | Create Lead | Create Opportunity | Create Task
 * | Not Relevant`. `Respond` is just a link to the Conversations detail pane (CRM-07.6's
 * reply composer already lives there, nothing new to build); `Not Relevant` is
 * `markInteractionNotActionable()` (CRM-09.1), already built. This file is the other
 * two conversions.
 *
 * "Conversion preserves original interaction": every function here only ever inserts or
 * updates a *different* row (lead/opportunity/activity/conversation) -- the interaction
 * itself is never touched. "Existing party is reused": both conversions require the
 * interaction to already have a resolved `party_id` (CRM-06.4) and use it directly,
 * never creating a new one -- a still-unmatched sender's tier-5 "create new party"
 * remains that story's own territory, not this one's. "User never loses the original
 * message context": the created lead/opportunity is linked back onto
 * `crm.conversation.lead_id`/`opportunity_id` (only when not already set, so a second
 * click never clobbers an existing link), so the Conversations page's own "Lead: ..." /
 * "Opportunity: ..." badges (CRM-06.2) surface it immediately, and the interaction stays
 * visible in the same conversation timeline either way.
 */

async function getInteractionContext(businessId: string, interactionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("interaction").select("id, party_id, conversation_id, content_excerpt").eq("id", interactionId).eq("business_id", businessId).single();
  if (error) throw error;
  return data as { id: string; party_id: string | null; conversation_id: string; content_excerpt: string | null };
}

/**
 * Reuses the party's own most recent still-open lead (any source) when one exists,
 * rather than always creating a new one keyed to this interaction -- a party who
 * already has an active lead from, say, CRM-07.11's WhatsApp auto-capture shouldn't end
 * up with a second, competing lead just because a human clicked "Create Lead" on a
 * later message in the same thread. Only when no open lead exists does this create one,
 * deduped the same way `promoteProspectToLead()` already is (CRM-03.1): keyed on
 * `(business_id, source_module='crm_interaction', source_reference=interactionId)`.
 */
export async function convertInteractionToLead(businessId: string, interactionId: string): Promise<{ leadId: string }> {
  const interaction = await getInteractionContext(businessId, interactionId);
  if (!interaction.party_id) {
    throw new Error("This message isn't linked to a known contact yet, so a lead can't be created from it.");
  }

  const supabase = await createClient();
  const { data: existingActiveLead, error: existingError } = await supabase
    .from("lead")
    .select("id")
    .eq("business_id", businessId)
    .eq("party_id", interaction.party_id)
    .not("status", "in", "(won,lost)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const leadId = existingActiveLead ? existingActiveLead.id : (await createLead(businessId, { partyId: interaction.party_id, source: "manual", sourceModule: "crm_interaction", sourceReference: interaction.id })).id;

  const { error: conversationError } = await supabase.from("conversation").update({ lead_id: leadId }).eq("id", interaction.conversation_id).eq("business_id", businessId).is("lead_id", null);
  if (conversationError) throw conversationError;

  return { leadId };
}

/** Creates (or reuses) the party's lead first, then converts it -- reusing
 * `convertLeadToOpportunity()` (CRM-03.4) rather than a parallel direct-insert path. If
 * the lead was already converted by an earlier click, reuses that existing opportunity
 * instead of creating a duplicate one for the same lead. */
export async function convertInteractionToOpportunity(businessId: string, interactionId: string): Promise<{ opportunityId: string }> {
  const { leadId } = await convertInteractionToLead(businessId, interactionId);
  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase.from("lead").select("status").eq("id", leadId).eq("business_id", businessId).single();
  if (leadError) throw leadError;

  let opportunityId: string;
  if (lead.status === "opportunity" || lead.status === "won") {
    const { data: existingOpportunity, error: opportunityError } = await supabase
      .from("opportunity")
      .select("id")
      .eq("business_id", businessId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (opportunityError) throw opportunityError;
    if (!existingOpportunity) throw new Error("This lead was already converted, but its opportunity could not be found.");
    opportunityId = existingOpportunity.id;
  } else {
    opportunityId = (await convertLeadToOpportunity(businessId, leadId)).opportunityId;
  }

  const interaction = await getInteractionContext(businessId, interactionId);
  const { error: conversationError } = await supabase.from("conversation").update({ opportunity_id: opportunityId }).eq("id", interaction.conversation_id).eq("business_id", businessId).is("opportunity_id", null);
  if (conversationError) throw conversationError;

  return { opportunityId };
}

/** Attached to the party (when known) and the conversation either way, so it shows up
 * on both the Customer 360 timeline and the conversation itself -- unlike the lead/
 * opportunity conversions, an unmatched sender can still get a task (there's nothing
 * ambiguous about "someone needs to follow up on this thread"). */
export async function convertInteractionToTask(businessId: string, interactionId: string, dueAt?: string | null): Promise<{ activityId: string }> {
  const interaction = await getInteractionContext(businessId, interactionId);
  const activity = await createActivity(businessId, {
    type: "task",
    subject: interaction.content_excerpt ? `Follow up: ${interaction.content_excerpt.slice(0, 80)}` : "Follow up on message",
    partyId: interaction.party_id ?? undefined,
    conversationId: interaction.conversation_id,
    dueAt: dueAt ?? undefined,
  });
  return { activityId: activity.id };
}
