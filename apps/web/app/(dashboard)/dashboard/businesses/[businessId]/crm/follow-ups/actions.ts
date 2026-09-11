"use server";

import { revalidatePath } from "next/cache";
import { completeFollowUp } from "@cofounderai/module-crm/lib/follow-ups/mutations";

export async function completeFollowUpAction(businessId: string, followUpId: string): Promise<void> {
  await completeFollowUp(businessId, followUpId);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/follow-ups`);
}
