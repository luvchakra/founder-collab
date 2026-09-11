"use server";

import { revalidatePath } from "next/cache";
import { updateInteractionIntent } from "@cofounderai/module-crm/lib/interactions/mutations";
import type { MessageIntent } from "@cofounderai/module-crm/lib/interactions/intent-classification";

/** CRM-09.4's "user can override classification" -- a human correcting the
 * deterministic classifier's (CRM-09.3) guess for one interaction. */
export async function overrideInteractionIntentAction(businessId: string, interactionId: string, formData: FormData): Promise<void> {
  const intent = String(formData.get("intent") || "") as MessageIntent;
  await updateInteractionIntent(businessId, interactionId, intent);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/lost-business`);
}
