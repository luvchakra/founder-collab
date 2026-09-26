"use server";

import { revalidatePath } from "next/cache";
import {
  updateAiFeaturePolicy,
  type UpdateAiFeaturePolicyInput,
} from "@cofounderai/core/admin/platform-ai-feature-policies";
import { setAiOperationEnabled } from "@cofounderai/core/admin/platform-ai-operation-switches";

/**
 * PLATFORM-P0-09.4 (AI Feature Policies, config-only, §13). A thin `revalidatePath` wrapper
 * over the one audited mutation path in `platform-ai-feature-policies.ts` -- there is no
 * plain, reason-free mutation anywhere in this file.
 */
export async function updateAiFeaturePolicyAction(
  input: UpdateAiFeaturePolicyInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await updateAiFeaturePolicy(input);
  if (!result.ok) return result;
  revalidatePath("/platform/ai-feature-policies");
  return result;
}

/** PLATFORM-P0-10.4 -- switch one AI feature off (or back on) platform-wide. */
export async function setAiOperationEnabledAction(operation: string, enabled: boolean, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setAiOperationEnabled({ operation, enabled, reason });
  if (result.ok) revalidatePath("/platform/ai-feature-policies");
  return result;
}
