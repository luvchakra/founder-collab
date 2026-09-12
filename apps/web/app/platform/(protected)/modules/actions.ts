"use server";

import { revalidatePath } from "next/cache";
import {
  getModuleImpact,
  setModuleEnabled,
  setModuleMeta,
  setModuleVisible,
  type ModuleStatus,
  type SetModuleEnabledInput,
  type SetModuleMetaInput,
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

export async function setModuleMetaAction(
  input: SetModuleMetaInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setModuleMeta(input);
  if (!result.ok) return result;
  revalidatePath("/platform/modules");
  return { ok: true };
}

export async function getModuleImpactAction(moduleKey: string): Promise<{ affectedBusinessCount: number }> {
  return getModuleImpact(moduleKey);
}

export async function setModuleEnabledAction(
  input: SetModuleEnabledInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setModuleEnabled(input);
  if (!result.ok) return result;
  revalidatePath("/platform/modules");
  return { ok: true };
}

export type { ModuleStatus };
