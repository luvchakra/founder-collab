import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
import type { CreateLeadInput, Lead, LeadStatus } from "./types";

const POSTGRES_UNIQUE_VIOLATION = "23505";

/** CRM-01.3's `createLead()` contract operation. Publishes `crm.lead.created`
 * (CRM-01.4). `client` (CRM-07.11): an optional override, same DI shape
 * `interactions/matching.ts#CrmClientOverrides` established -- a webhook capturing a
 * lead automatically (no logged-in user) passes its own admin client here instead of
 * the default RLS-scoped one.
 *
 * CRM-15.2: deliberately no `requirePermission()` gate here -- `has_permission()` needs
 * a real `auth.uid()`, which the webhook path above has none of. The gate belongs on
 * each *session-based* caller instead (`promoteProspectToLead()` below,
 * `interactions/conversion-actions.ts#convertInteractionToLead()`), not on this shared
 * primitive both a human action and an unauthenticated webhook call into. */
export async function createLead(businessId: string, input: CreateLeadInput, client?: SupabaseClient): Promise<Lead> {
  const supabase = client ?? (await createClient());
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

  await publishCrmEvent(businessId, "crm.lead.created", { v: 1, leadId: data.id, partyId: data.party_id, source: data.source }, undefined, client);

  return data as Lead;
}

/**
 * CRM-01.3's `convertLeadToOpportunity()` contract operation (CRM-03.4's own full
 * acceptance criteria -- Kanban/value/close-date fields -- land with CRM-04.x; this is
 * the minimal state transition: create the opportunity row carrying the lead's party/
 * source/owner forward, then mark the lead 'opportunity'. The lead row itself is never
 * deleted, so it stays auditable ("lead remains auditable after conversion").
 *
 * "Product interest is preserved" and "activity and conversation history remain
 * attached": rather than trusting that every future reader of `crm.activity`/
 * `crm.conversation`/`crm.product_interest` remembers to also check `lead_id` (not just
 * `opportunity_id`) for history that predates the conversion, this backfills
 * `opportunity_id` onto every such row that was attached to the lead and has no
 * opportunity yet -- their own `lead_id` is left untouched, so both links now hold.
 * Publishes `crm.opportunity.created` and `crm.lead.converted` (CRM-01.4).
 */
export async function convertLeadToOpportunity(businessId: string, leadId: string): Promise<{ opportunityId: string }> {
  await requirePermission(businessId, "crm_opportunities.manage");
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

  for (const table of ["activity", "conversation", "follow_up", "product_interest"] as const) {
    const { error: backfillError } = await supabase
      .from(table)
      .update({ opportunity_id: opportunity.id })
      .eq("business_id", businessId)
      .eq("lead_id", leadId)
      .is("opportunity_id", null);
    if (backfillError) throw backfillError;
  }

  await publishCrmEvent(businessId, "crm.opportunity.created", { v: 1, opportunityId: opportunity.id, partyId: lead.party_id, leadId: lead.id });
  await publishCrmEvent(businessId, "crm.lead.converted", { v: 1, leadId, opportunityId: opportunity.id });

  return { opportunityId: opportunity.id };
}

/**
 * CRM-03.1: "Turn discovered prospects into managed relationships without data
 * re-entry." `sourceReference` is the Discovery prospect id -- carrying forward "product
 * reference, ICP fit, buying signals, research summary reference, outreach state, latest
 * response" per the backlog's own "Show" list is done by *reference*, not by copying
 * those fields onto `crm.lead` (Section 4's reuse map: "score/reason + source
 * reference," "optional research summary pointer/reference" -- not unrestricted copies).
 * A later lookup (e.g. `getProspectSummaryForParty`, already used by Customer 360 and
 * the relationship timeline) reads the live values back from Discovery through
 * `source_reference` rather than trusting a stale snapshot.
 *
 * Idempotent on (business_id, source_module='discovery', source_reference=prospectId) --
 * "CRM lead is not duplicated if already promoted" is this story's own explicit
 * acceptance criterion, not a nice-to-have. The upfront check below is an optimization
 * (skip the insert round trip in the common case); the actual guarantee against a race
 * between two concurrent promote attempts is `crm.lead`'s own
 * `lead_source_reference_uq` partial unique index, whose violation is caught here the
 * same way `recordInteraction()` handles its own dedupe race (CRM-01.6).
 */
export async function promoteProspectToLead(
  businessId: string,
  input: { partyId: string; prospectId: string; ownerId?: string | null },
): Promise<{ leadId: string; alreadyPromoted: boolean }> {
  await requirePermission(businessId, "leads.manage");
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("lead")
    .select("id")
    .eq("business_id", businessId)
    .eq("source_module", "discovery")
    .eq("source_reference", input.prospectId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { leadId: existing.id, alreadyPromoted: true };

  try {
    const lead = await createLead(businessId, {
      partyId: input.partyId,
      source: "discovery",
      sourceModule: "discovery",
      sourceReference: input.prospectId,
      ownerId: input.ownerId ?? null,
    });
    return { leadId: lead.id, alreadyPromoted: false };
  } catch (err) {
    if ((err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
      const { data: racedExisting, error: racedError } = await supabase
        .from("lead")
        .select("id")
        .eq("business_id", businessId)
        .eq("source_module", "discovery")
        .eq("source_reference", input.prospectId)
        .single();
      if (racedError) throw racedError;
      return { leadId: racedExisting.id, alreadyPromoted: true };
    }
    throw err;
  }
}

/**
 * CRM-04.1's lead lifecycle: `new -> contacted -> engaged -> qualified -> opportunity ->
 * won/lost`, plus `nurture`/`unresponsive`/`disqualified`. Only a human calls this --
 * there is no AI-driven caller anywhere in this codebase, so "AI may suggest a state
 * change but cannot silently change it" holds by construction, not by a guard this
 * function would otherwise need. "Status transitions are auditable" is `core.audit_log`
 * (D-10), the platform's existing generic mechanism, not a CRM-specific history table --
 * `crm.assignment` is a different concept (who owns it, not what state it's in).
 */
export async function updateLeadStatus(businessId: string, leadId: string, status: LeadStatus): Promise<Lead> {
  await requirePermission(businessId, "leads.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: before, error: beforeError } = await supabase.from("lead").select("status").eq("id", leadId).eq("business_id", businessId).single();
  if (beforeError) throw beforeError;

  const { data, error } = await supabase.from("lead").update({ status }).eq("id", leadId).eq("business_id", businessId).select("*").single();
  if (error) throw error;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_lead.status_changed",
    entityType: "crm_lead",
    entityId: leadId,
    before: { status: before.status },
    after: { status },
  });

  await publishCrmEvent(businessId, "crm.lead.updated", { v: 1, leadId, changedFields: ["status"] });

  return data as Lead;
}

/** CRM-05.2: designates one activity (already attached to this lead) as its next
 * action, or clears it (`activityId: null`) -- e.g. right after that activity is
 * completed, so the UI's "no next action set" empty state (and its add-next-action
 * form) takes its place. */
export async function setLeadNextAction(businessId: string, leadId: string, activityId: string | null): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("lead").update({ next_action_id: activityId }).eq("id", leadId).eq("business_id", businessId);
  if (error) throw error;
}
