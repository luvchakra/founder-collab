"use server";

import { revalidatePath } from "next/cache";
import {
  updateNotificationPolicies,
  type UpdateNotificationPoliciesInput,
} from "@cofounderai/core/admin/platform-notification-policies";

/**
 * PLATFORM-P0-11.3 (Notification Policies, config-only, §15). A thin `revalidatePath`
 * wrapper over the one mutation path in `platform-notification-policies.ts`.
 */
export async function updateNotificationPoliciesAction(
  input: UpdateNotificationPoliciesInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await updateNotificationPolicies(input);
  if (!result.ok) return result;
  revalidatePath("/platform/notification-policies");
  return result;
}
