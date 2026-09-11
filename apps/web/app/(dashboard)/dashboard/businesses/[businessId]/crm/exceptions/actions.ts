"use server";

import { revalidatePath } from "next/cache";
import { resolveJobPartsShortage } from "@cofounderai/module-fsm/lib/inventory-integration/mutations";
import { createAssessmentRequestForOpportunity } from "@cofounderai/module-crm/lib/opportunities/mutations";
import type { JobPartsShortageResolution } from "@cofounderai/module-fsm/lib/jobs/types";

function exceptionsPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm/exceptions`;
}

/**
 * INT-07.2's "Exception Resolution Actions" -- same resolution vocabulary and mutation
 * as the FSM job detail page's own shortage picker (INT-03.3's `resolveJobPartsShortage`),
 * reachable here without navigating away from the aggregated Exception Center list. A
 * plain `FormData` action (not typed positional args) -- this list's rows aren't a
 * client component with controlled state, same "already read via FormData" shape
 * `createOpportunityFollowUpAction` on the opportunity page uses for its own plain form.
 */
export async function resolveExceptionPartsShortageAction(businessId: string, jobId: string, formData: FormData): Promise<void> {
  const resolution = String(formData.get("resolution") || "") as JobPartsShortageResolution;
  const note = String(formData.get("note") || "").trim() || null;
  await resolveJobPartsShortage(businessId, jobId, resolution, note);
  revalidatePath(exceptionsPath(businessId));
}

/**
 * INT-07.2: the same one-click action as the opportunity detail page's own "Request FSM
 * assessment" button (INT-04.2's `createAssessmentRequestForOpportunity`) -- safe to
 * expose without the opportunity page's missing-contact/address hints alongside it,
 * since that function already tolerates both being absent rather than throwing.
 */
export async function requestExceptionAssessmentAction(businessId: string, opportunityId: string): Promise<void> {
  await createAssessmentRequestForOpportunity(businessId, opportunityId);
  revalidatePath(exceptionsPath(businessId));
}
