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
import { createPlanPrice, setPlanPriceActive } from "@cofounderai/core/admin/platform-billing-ops";

type CreatePlanPriceInput = Parameters<typeof createPlanPrice>[0];

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

// BILL-32 (§35, §72) -- plan price mappings shown on this plan's detail page. Provider
// product/price ids are not secrets; createPlanPrice() validates them and deactivates any
// active price it replaces.
export async function createPlanPriceAction(
  planId: string,
  input: Omit<CreatePlanPriceInput, "planId">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await createPlanPrice({ ...input, planId });
  if (result.ok) revalidatePath(`/platform/plans/${planId}/entitlements`);
  return result;
}

export async function setPlanPriceActiveAction(
  planId: string,
  priceId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setPlanPriceActive(priceId, active);
  if (result.ok) revalidatePath(`/platform/plans/${planId}/entitlements`);
  return result;
}
