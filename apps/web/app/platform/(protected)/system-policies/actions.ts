"use server";

import { revalidatePath } from "next/cache";
import {
  updateSystemPolicies,
  type UpdateSystemPoliciesInput,
} from "@cofounderai/core/admin/platform-system-policies";

/**
 * PLATFORM-P0-14.1/14.2/14.3 (Platform Policies, config-only, §18). A thin `revalidatePath`
 * wrapper over the one audited mutation path in `platform-system-policies.ts` -- there is no
 * plain, reason-free mutation anywhere in this file.
 */
export async function updateSystemPoliciesAction(
  input: UpdateSystemPoliciesInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await updateSystemPolicies(input);
  if (!result.ok) return result;
  revalidatePath("/platform/system-policies");
  return result;
}
