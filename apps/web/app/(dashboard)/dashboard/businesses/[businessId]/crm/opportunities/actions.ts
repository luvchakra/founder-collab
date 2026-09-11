"use server";

import { revalidatePath } from "next/cache";
import { updateOpportunityStage } from "@cofounderai/module-crm/lib/opportunities/mutations";

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
