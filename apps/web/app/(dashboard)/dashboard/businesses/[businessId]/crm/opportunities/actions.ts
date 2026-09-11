"use server";

import { revalidatePath } from "next/cache";
import { updateOpportunityStage, updateOpportunityValue } from "@cofounderai/module-crm/lib/opportunities/mutations";

function opportunitiesPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm/opportunities`;
}

/** CRM-04.2: "Drag/drop stage change with audit event" -- the mutation itself does the
 * auditing (writeAuditLog) and event publishing; this action is just the revalidation
 * wrapper the Kanban board's client component calls. */
export async function updateOpportunityStageAction(businessId: string, opportunityId: string, stageId: string): Promise<void> {
  await updateOpportunityStage(businessId, opportunityId, stageId);
  revalidatePath(opportunitiesPath(businessId));
}

/** CRM-04.3's edit-value dialog action. */
export async function updateOpportunityValueAction(businessId: string, opportunityId: string, formData: FormData): Promise<void> {
  const rawValue = formData.get("estimatedValue");
  const rawProbability = formData.get("probability");
  const rawCloseDate = formData.get("expectedCloseDate");
  await updateOpportunityValue(businessId, opportunityId, {
    estimatedValue: rawValue ? Number(rawValue) : null,
    currency: String(formData.get("currency") || "INR"),
    probability: rawProbability ? Number(rawProbability) : null,
    expectedCloseDate: rawCloseDate ? String(rawCloseDate) : null,
  });
  revalidatePath(opportunitiesPath(businessId));
}
