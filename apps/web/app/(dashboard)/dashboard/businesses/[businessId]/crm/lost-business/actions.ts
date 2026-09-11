"use server";

import { revalidatePath } from "next/cache";
import { markInteractionNotActionable, updateInteractionIntent } from "@cofounderai/module-crm/lib/interactions/mutations";
import { convertInteractionToLead, convertInteractionToOpportunity, convertInteractionToTask } from "@cofounderai/module-crm/lib/interactions/conversion-actions";
import type { MessageIntent } from "@cofounderai/module-crm/lib/interactions/intent-classification";

/** CRM-09.4's "user can override classification" -- a human correcting the
 * deterministic classifier's (CRM-09.3) guess for one interaction. */
export async function overrideInteractionIntentAction(businessId: string, interactionId: string, formData: FormData): Promise<void> {
  const intent = String(formData.get("intent") || "") as MessageIntent;
  await updateInteractionIntent(businessId, interactionId, intent);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/lost-business`);
}

function lostBusinessPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm/lost-business`;
}

/** CRM-09.5's `Not Relevant` action -- the same "mark not actionable" CRM-09.1 already
 * built, just exposed here under the label the backlog's own queue action row uses. */
export async function markNotRelevantAction(businessId: string, interactionId: string): Promise<void> {
  await markInteractionNotActionable(businessId, interactionId);
  revalidatePath(lostBusinessPath(businessId));
}

export async function createLeadFromInteractionAction(businessId: string, interactionId: string): Promise<void> {
  await convertInteractionToLead(businessId, interactionId);
  revalidatePath(lostBusinessPath(businessId));
}

export async function createOpportunityFromInteractionAction(businessId: string, interactionId: string): Promise<void> {
  await convertInteractionToOpportunity(businessId, interactionId);
  revalidatePath(lostBusinessPath(businessId));
}

export async function createTaskFromInteractionAction(businessId: string, interactionId: string): Promise<void> {
  await convertInteractionToTask(businessId, interactionId);
  revalidatePath(lostBusinessPath(businessId));
}
