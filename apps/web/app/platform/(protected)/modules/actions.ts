"use server";

import { revalidatePath } from "next/cache";
import {
  getModuleImpact,
  setModuleStatus,
  setModuleVersion,
  setModuleVisible,
  type ModuleStatus,
  type SetModuleStatusInput,
  type SetModuleVersionInput,
} from "@cofounderai/core/admin/platform-modules";

export async function setModuleVisibleAction(
  moduleKey: string,
  visible: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setModuleVisible(moduleKey, visible);
  if (!result.ok) return result;
  revalidatePath("/platform/modules");
  return { ok: true };
}

export async function setModuleVersionAction(
  input: SetModuleVersionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setModuleVersion(input);
  if (!result.ok) return result;
  revalidatePath("/platform/modules");
  return { ok: true };
}

export async function getModuleImpactAction(moduleKey: string): Promise<{ affectedBusinessCount: number }> {
  return getModuleImpact(moduleKey);
}

/** PLATFORM-P0-07.3's own reconciliation (decision #1) -- the ONE way to change a module's
 * platform-wide status from the UI, including into/out of `disabled` (the old kill switch)
 * and `maintenance`. See `setModuleStatus()`'s own docstring for why there is no longer a
 * separate `setModuleEnabledAction()`. */
export async function setModuleStatusAction(
  input: SetModuleStatusInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setModuleStatus(input);
  if (!result.ok) return result;
  revalidatePath("/platform/modules");
  return { ok: true };
}

export type { ModuleStatus };
