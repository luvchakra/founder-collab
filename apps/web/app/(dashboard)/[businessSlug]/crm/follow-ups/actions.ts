"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { completeFollowUp } from "@cofounderai/module-crm/lib/follow-ups/mutations";

export async function completeFollowUpAction(businessId: string, followUpId: string): Promise<void> {
  await completeFollowUp(businessId, followUpId);
  revalidatePath(`${await businessPath(businessId)}/crm/follow-ups`);
}
