"use server";

import { revalidatePath } from "next/cache";
import { setPlanModuleEnabled } from "@cofounderai/core/admin/platform-plan-modules";
import {
  clearPlanLimit,
  setPlanLimit,
  type ResourceKey,
  type SetPlanLimitInput,
} from "@cofounderai/core/admin/platform-plan-limits";

export async function setModuleEnabledAction(
  planId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setPlanModuleEnabled(planId, moduleKey, enabled);
  if (result.ok) revalidatePath(`/platform/plans/${planId}/entitlements`);
  return result;
}

export async function setPlanLimitAction(
  planId: string,
  resourceKey: ResourceKey,
  input: SetPlanLimitInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setPlanLimit(planId, resourceKey, input);
  if (result.ok) revalidatePath(`/platform/plans/${planId}/entitlements`);
  return result;
}

export async function clearPlanLimitAction(
  planId: string,
  resourceKey: ResourceKey,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await clearPlanLimit(planId, resourceKey);
  if (result.ok) revalidatePath(`/platform/plans/${planId}/entitlements`);
  return result;
}
