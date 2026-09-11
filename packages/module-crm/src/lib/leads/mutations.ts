import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
import type { CreateLeadInput, Lead } from "./types";

/** CRM-01.3's `createLead()` contract operation. Publishes `crm.lead.created`
 * (CRM-01.4). */
export async function createLead(businessId: string, input: CreateLeadInput): Promise<Lead> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead")
    .insert({
      business_id: businessId,
      party_id: input.partyId,
      source: input.source ?? "manual",
      source_module: input.sourceModule ?? null,
      source_reference: input.sourceReference ?? null,
      owner_id: input.ownerId ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  await publishCrmEvent(businessId, "crm.lead.created", { v: 1, leadId: data.id, partyId: data.party_id, source: data.source });

  return data as Lead;
}

/** CRM-01.3's `convertLeadToOpportunity()` contract operation (CRM-03.4's own full
 * acceptance criteria -- Kanban/value/close-date fields -- land with CRM-04.x; this is
 * the minimal state transition: create the opportunity row carrying the lead's party/
 * source/owner forward, then mark the lead 'opportunity'. The lead row itself is never
 * deleted, so it stays auditable, and nothing that already points at the lead (activity,
 * follow_up, conversation) needs to change -- they keep their own lead_id untouched.
 * Publishes `crm.opportunity.created` and `crm.lead.converted` (CRM-01.4). */
export async function convertLeadToOpportunity(businessId: string, leadId: string): Promise<{ opportunityId: string }> {
  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase.from("lead").select("*").eq("id", leadId).eq("business_id", businessId).single();
  if (leadError) throw leadError;

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunity")
    .insert({
      business_id: businessId,
      party_id: lead.party_id,
      lead_id: lead.id,
      source: lead.source,
      owner_id: lead.owner_id,
    })
    .select("id")
    .single();
  if (opportunityError) throw opportunityError;

  const { error: updateError } = await supabase.from("lead").update({ status: "opportunity" }).eq("id", leadId);
  if (updateError) throw updateError;

  await publishCrmEvent(businessId, "crm.opportunity.created", { v: 1, opportunityId: opportunity.id, partyId: lead.party_id, leadId: lead.id });
  await publishCrmEvent(businessId, "crm.lead.converted", { v: 1, leadId, opportunityId: opportunity.id });

  return { opportunityId: opportunity.id };
}
