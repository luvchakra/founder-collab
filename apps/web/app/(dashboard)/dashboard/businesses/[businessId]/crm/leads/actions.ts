"use server";

import { revalidatePath } from "next/cache";
import { updateLeadStatus } from "@cofounderai/module-crm/lib/leads/mutations";
import type { LeadStatus } from "@cofounderai/module-crm/lib/leads/types";

function leadsPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm/leads`;
}

/** CRM-04.1: "user can manually change state." No AI caller exists for this anywhere in
 * the codebase -- "AI may suggest a state change but cannot silently change it" holds by
 * construction. */
export async function updateLeadStatusAction(businessId: string, leadId: string, formData: FormData): Promise<void> {
  const status = String(formData.get("status")) as LeadStatus;
  await updateLeadStatus(businessId, leadId, status);
  revalidatePath(leadsPath(businessId));
}
