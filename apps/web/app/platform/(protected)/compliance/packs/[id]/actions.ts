"use server";

import { revalidatePath } from "next/cache";
import {
  createCompliancePackFeature,
  setCompliancePackFeatureEnabled,
  type CreateCompliancePackFeatureInput,
} from "@cofounderai/core/admin/platform-compliance";

export async function createCompliancePackFeatureAction(
  packId: string,
  input: CreateCompliancePackFeatureInput,
): ReturnType<typeof createCompliancePackFeature> {
  const result = await createCompliancePackFeature(packId, input);
  if (result.ok) revalidatePath(`/platform/compliance/packs/${packId}`);
  return result;
}

export async function setCompliancePackFeatureEnabledAction(
  packId: string,
  featureId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setCompliancePackFeatureEnabled(featureId, enabled);
  if (result.ok) revalidatePath(`/platform/compliance/packs/${packId}`);
  return result;
}
