"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createJobChargeType, setJobChargeTypeActive, updateJobChargeType } from "@cofounderai/module-fsm/lib/job-charge-types/mutations";
import { createServiceType, setServiceTypeActive, updateServiceType } from "@cofounderai/module-fsm/lib/service-types/mutations";
import { updateFsmSettings } from "@cofounderai/module-fsm/lib/settings/mutations";
import type { UpdateFsmSettingsInput } from "@cofounderai/module-fsm/lib/settings/types";

function settingsPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/fsm/settings`;
}

export async function createServiceTypeAction(businessId: string, name: string, description?: string): Promise<void> {
  await requirePermission(businessId, "settings.manage");
  await createServiceType(businessId, name, description);
  revalidatePath(settingsPath(businessId));
}

export async function updateServiceTypeAction(businessId: string, id: string, name: string, description?: string): Promise<void> {
  await requirePermission(businessId, "settings.manage");
  await updateServiceType(id, businessId, name, description);
  revalidatePath(settingsPath(businessId));
}

export async function setServiceTypeActiveAction(businessId: string, id: string, isActive: boolean): Promise<void> {
  await requirePermission(businessId, "settings.manage");
  await setServiceTypeActive(id, businessId, isActive);
  revalidatePath(settingsPath(businessId));
}

export async function createJobChargeTypeAction(businessId: string, name: string): Promise<void> {
  await requirePermission(businessId, "settings.manage");
  await createJobChargeType(businessId, name);
  revalidatePath(settingsPath(businessId));
}

export async function updateJobChargeTypeAction(businessId: string, id: string, name: string): Promise<void> {
  await requirePermission(businessId, "settings.manage");
  await updateJobChargeType(id, businessId, name);
  revalidatePath(settingsPath(businessId));
}

export async function setJobChargeTypeActiveAction(businessId: string, id: string, isActive: boolean): Promise<void> {
  await requirePermission(businessId, "settings.manage");
  await setJobChargeTypeActive(id, businessId, isActive);
  revalidatePath(settingsPath(businessId));
}

export async function updateFsmSettingsAction(businessId: string, input: UpdateFsmSettingsInput): Promise<void> {
  await requirePermission(businessId, "settings.manage");
  await updateFsmSettings(businessId, input);
  revalidatePath(settingsPath(businessId));
}
