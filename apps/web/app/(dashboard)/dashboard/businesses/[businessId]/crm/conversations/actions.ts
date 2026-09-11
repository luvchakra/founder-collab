"use server";

import { revalidatePath } from "next/cache";
import { assignEntity } from "@cofounderai/module-crm/lib/assignment/mutations";
import { sendWhatsAppReply } from "@cofounderai/module-crm/lib/whatsapp/messaging";

/** CRM-06.3's assign/reassign action -- ownerId "" unassigns (assignEntity treats
 * null the same as an explicit unassign). */
export async function assignConversationAction(businessId: string, conversationId: string, formData: FormData): Promise<void> {
  const ownerId = String(formData.get("ownerId") || "") || null;
  await assignEntity(businessId, "conversation", conversationId, ownerId);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/conversations`);
}

export type SendWhatsAppReplyActionState = { error: string } | null;

/** CRM-07.6/07.7: sends a free-form WhatsApp reply, or surfaces the 24-hour-window
 * error (with a hint to use a template instead, CRM-07.8) rather than throwing --
 * `useActionState`'s established pattern in this codebase for a form whose failure is
 * an ordinary, expected outcome (see the WhatsApp connect form, CRM-07.2). */
export async function sendWhatsAppReplyAction(businessId: string, conversationId: string, _prevState: SendWhatsAppReplyActionState, formData: FormData): Promise<SendWhatsAppReplyActionState> {
  const text = String(formData.get("text") || "").trim();
  if (!text) return { error: "Enter a message to send." };

  const result = await sendWhatsAppReply(businessId, conversationId, text);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/dashboard/businesses/${businessId}/crm/conversations`);
  return null;
}
