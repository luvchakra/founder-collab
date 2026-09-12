"use server";

import { revalidatePath } from "next/cache";
import {
  createFeatureFlag,
  deleteFeatureFlag,
  updateFeatureFlag,
  type CreateFeatureFlagInput,
  type DeleteFeatureFlagInput,
  type UpdateFeatureFlagInput,
} from "@cofounderai/core/admin/platform-feature-flags";

/**
 * PLATFORM-P0-08.1-08.4 ("Feature Flags", §12). Every action here is a thin
 * `revalidatePath` wrapper over the one audited mutation path in
 * `platform-feature-flags.ts` -- there is no plain, reason-free mutation anywhere in this
 * file, matching that module's own "every change is audited" stance.
 */

export async function createFeatureFlagAction(
  input: CreateFeatureFlagInput,
): Promise<{ ok: true; id: string } | { ok: false; fieldErrors: Record<string, string> }> {
  const result = await createFeatureFlag(input);
  if (!result.ok) return result;
  revalidatePath("/platform/feature-flags");
  return result;
}

export async function updateFeatureFlagAction(
  input: UpdateFeatureFlagInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await updateFeatureFlag(input);
  if (!result.ok) return result;
  revalidatePath("/platform/feature-flags");
  return result;
}

export async function deleteFeatureFlagAction(
  input: DeleteFeatureFlagInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await deleteFeatureFlag(input);
  if (!result.ok) return result;
  revalidatePath("/platform/feature-flags");
  return result;
}
