"use server";

import { revalidatePath } from "next/cache";
import { setPlanModuleEnabled } from "@cofounderai/core/admin/platform-plan-modules";
import {
  clearPlanLimit,
  setPlanLimit,
  type ResourceKey,
  type SetPlanLimitInput,
} from "@cofounderai/core/admin/platform-plan-limits";
import {
  createFeature,
  deleteFeature,
  setPlanFeatureEnabled,
  type CreateFeatureInput,
} from "@cofounderai/core/admin/platform-plan-features";

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

export async function setPlanFeatureEnabledAction(
  planId: string,
  featureId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setPlanFeatureEnabled(planId, featureId, enabled);
  if (result.ok) revalidatePath(`/platform/plans/${planId}/entitlements`);
  return result;
}

export async function createFeatureAction(
  planId: string,
  input: CreateFeatureInput,
): Promise<{ ok: true } | { ok: false; fieldErrors: Record<string, string> }> {
  const result = await createFeature(input);
  if (result.ok) {
    revalidatePath(`/platform/plans/${planId}/entitlements`);
    return { ok: true };
  }
  return result;
}

export async function deleteFeatureAction(
  planId: string,
  featureId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await deleteFeature(featureId);
  if (result.ok) revalidatePath(`/platform/plans/${planId}/entitlements`);
  return result;
}
