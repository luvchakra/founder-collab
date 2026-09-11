"use server";

import { revalidatePath } from "next/cache";
import { assignEntity } from "@cofounderai/module-crm/lib/assignment/mutations";

/** CRM-06.3's assign/reassign action -- ownerId "" unassigns (assignEntity treats
 * null the same as an explicit unassign). */
export async function assignConversationAction(businessId: string, conversationId: string, formData: FormData): Promise<void> {
  const ownerId = String(formData.get("ownerId") || "") || null;
  await assignEntity(businessId, "conversation", conversationId, ownerId);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/conversations`);
}
