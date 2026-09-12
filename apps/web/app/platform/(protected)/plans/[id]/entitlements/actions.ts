"use server";

import { revalidatePath } from "next/cache";
import { setPlanModuleEnabled } from "@cofounderai/core/admin/platform-plan-modules";

export async function setModuleEnabledAction(
  planId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setPlanModuleEnabled(planId, moduleKey, enabled);
  if (result.ok) revalidatePath(`/platform/plans/${planId}/entitlements`);
  return result;
}
