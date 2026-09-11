import { createClient } from "../../db/server";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import type { Assessment, CreateAssessmentInput } from "./types";

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
