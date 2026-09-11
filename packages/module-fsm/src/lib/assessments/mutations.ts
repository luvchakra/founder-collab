import { createClient } from "../../db/server";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { requireModule } from "@cofounderai/core/licensing/queries";
import type { Assessment, AssessmentOutcome, CreateAssessmentInput } from "./types";

export const ASSESSMENT_OUTCOME_LABEL: Record<AssessmentOutcome, string> = {
  scope_confirmed: "Scope confirmed",
  scope_changed: "Scope changed",
  additional_work_identified: "Additional work identified",
  not_feasible: "Not feasible",
  customer_unavailable: "Customer unavailable",
  follow_up_required: "Follow-up required",
};

/**
 * INT-04.2's own creation path. "Duplicate assessment creation prevented" is enforced
 * two ways: the unique partial index on `(business_id, source, source_reference)`
 * (defense in depth, catches any caller) and this function's own check-first, matching
 * `createFsmQuoteFromCrmOpportunity()`'s established shape -- an existing assessment for
 * the same `crmOpportunityId` is returned as-is rather than creating a second one.
 */
export async function createAssessment(businessId: string, input: CreateAssessmentInput): Promise<Assessment> {
  await requirePermission(businessId, "assessments.manage");
  const supabase = await createClient();

  if (input.crmOpportunityId) {
    const { data: existing, error: existingError } = await supabase
      .from("assessments")
      .select("*")
      .eq("business_id", businessId)
      .eq("source", "crm")
      .eq("source_reference", input.crmOpportunityId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing as Assessment;
  }

  const { data, error } = await supabase
    .from("assessments")
    .insert({
      business_id: businessId,
      party_id: input.partyId,
      primary_contact_id: input.contactId || null,
      service_address_id: input.serviceAddressId || null,
      kind: input.kind,
      requested_scope: input.requestedScope || null,
      customer_notes: input.customerNotes || null,
      discovery_context: input.discoveryContext || null,
      preferred_timing: input.preferredTiming || null,
      source: "crm",
      source_reference: input.crmOpportunityId || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Assessment;
}

/**
 * INT-04.3's "Assessment Outcome -> CRM Opportunity" -- FSM remains authoritative for
 * the visit/assessment itself, so this is a plain FSM-internal mutation (not part of
 * `contract/index.ts` -- that's the CRM-facing boundary; FSM's own staff record the
 * outcome from FSM's own assessment page, CRM never writes it). Sets `status` from the
 * outcome recorded (`not_feasible` maps to the matching status, everything else means
 * the visit happened and is now `completed`) -- one human action updates both fields
 * together rather than leaving them to drift out of sync.
 */
export async function recordAssessmentOutcome(businessId: string, assessmentId: string, outcome: AssessmentOutcome, outcomeNotes: string | null): Promise<Assessment> {
  await requireModule(businessId, "fsm");
  await requirePermission(businessId, "assessments.manage");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assessments")
    .update({
      outcome,
      outcome_notes: outcomeNotes,
      status: outcome === "not_feasible" ? "not_feasible" : "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", assessmentId)
    .eq("business_id", businessId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Assessment;
}
