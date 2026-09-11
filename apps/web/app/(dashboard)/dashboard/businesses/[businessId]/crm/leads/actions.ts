"use server";

import { revalidatePath } from "next/cache";
import { updateLeadStatus } from "@cofounderai/module-crm/lib/leads/mutations";
import { assignEntity } from "@cofounderai/module-crm/lib/assignment/mutations";
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

/** CRM-05.4's inline assign form action. */
export async function assignLeadAction(businessId: string, leadId: string, formData: FormData): Promise<void> {
  const ownerId = String(formData.get("ownerId") || "") || null;
  await assignEntity(businessId, "lead", leadId, ownerId);
  revalidatePath(leadsPath(businessId));
}
