"use server";

import { revalidatePath } from "next/cache";
import { assignEntity } from "@cofounderai/module-crm/lib/assignment/mutations";
import { sendWhatsAppReply, sendWhatsAppTemplate } from "@cofounderai/module-crm/lib/whatsapp/messaging";
import { markInteractionNotActionable } from "@cofounderai/module-crm/lib/interactions/mutations";
import { convertInteractionToLead, convertInteractionToOpportunity, convertInteractionToTask } from "@cofounderai/module-crm/lib/interactions/conversion-actions";

/** CRM-06.3's assign/reassign action -- ownerId "" unassigns (assignEntity treats
 * null the same as an explicit unassign). */
export async function assignConversationAction(businessId: string, conversationId: string, formData: FormData): Promise<void> {
  const ownerId = String(formData.get("ownerId") || "") || null;
  await assignEntity(businessId, "conversation", conversationId, ownerId);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/conversations`);
}

/** CRM-09.1's "user can mark not actionable" -- a false positive from the deterministic
 * rules engine (or a caller's own classification) that a human has decided doesn't
 * actually need a reply. */
export async function markInteractionNotActionableAction(businessId: string, interactionId: string): Promise<void> {
  await markInteractionNotActionable(businessId, interactionId);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/conversations`);
}

/**
 * CRM-08.4's "create a response opportunity" for a high-intent Instagram comment (no
 * send path exists for it yet, so there's no "Respond" action here the way the Lost
 * Business Queue's own copy of these three has -- just the same one-click conversions,
 * reusing CRM-09.5's mutations directly rather than duplicating them).
 */
export async function createLeadFromInteractionAction(businessId: string, interactionId: string): Promise<void> {
  await convertInteractionToLead(businessId, interactionId);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/conversations`);
}

export async function createOpportunityFromInteractionAction(businessId: string, interactionId: string): Promise<void> {
  await convertInteractionToOpportunity(businessId, interactionId);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/conversations`);
}

export async function createTaskFromInteractionAction(businessId: string, interactionId: string): Promise<void> {
  await convertInteractionToTask(businessId, interactionId);
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

export type SendWhatsAppTemplateActionState = { error: string } | null;

/** CRM-07.8: the send path that still works once CRM-07.7's window has closed --
 * `variables` is one comma-separated field rather than a dynamic per-template input
 * list, a deliberate simplification (the count is validated against the template's own
 * `variable_count` server-side either way, so a mismatch surfaces as this action's own
 * error rather than a raw Graph API one). */
export async function sendWhatsAppTemplateAction(businessId: string, conversationId: string, _prevState: SendWhatsAppTemplateActionState, formData: FormData): Promise<SendWhatsAppTemplateActionState> {
  const templateId = String(formData.get("templateId") || "");
  if (!templateId) return { error: "Choose a template." };
  const variablesRaw = String(formData.get("variables") || "").trim();
  const variables = variablesRaw ? variablesRaw.split(",").map((v) => v.trim()) : [];

  const result = await sendWhatsAppTemplate(businessId, conversationId, templateId, variables);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/dashboard/businesses/${businessId}/crm/conversations`);
  return null;
}
