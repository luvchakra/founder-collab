import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import type { AssessmentRequirement } from "./types";

export const ASSESSMENT_REQUIREMENT_LABEL: Record<AssessmentRequirement, string> = {
  none: "No assessment required",
  remote: "Remote assessment",
  on_site: "On-site assessment required",
  technical: "Technical assessment required",
};

/**
 * INT-04.1's "Opportunity Requires Assessment" -- a CRM commercial requirement (this
 * epic's own framing: "This is a CRM commercial requirement; FSM owns the actual
 * service appointment/work"), stored the same way INT-02.1's `fulfillment_requirement`
 * is: never auto-computed, only ever written by an explicit human choice
 * (`setAssessmentRequirement()` below is the only writer). Unlike fulfillment there is
 * no existing signal on the opportunity this story could derive a smart default from
 * (no product/FSM-engagement combination implies "needs an on-site visit" -- that's
 * exactly the pre-quote information gap this epic exists to close), so the gate simply
 * defaults to `none` until a human says otherwise, rather than inventing a heuristic
 * with nothing real to base it on.
 */
export async function setAssessmentRequirement(businessId: string, opportunityId: string, value: AssessmentRequirement): Promise<void> {
  await requirePermission(businessId, "crm_opportunities.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing, error: existingError } = await supabase
    .from("opportunity")
    .select("assessment_requirement")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (existingError) throw existingError;

  const { error } = await supabase.from("opportunity").update({ assessment_requirement: value }).eq("id", opportunityId).eq("business_id", businessId);
  if (error) throw error;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.assessment_requirement_set",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    before: { assessment_requirement: existing.assessment_requirement },
    after: { assessment_requirement: value },
  });
}
