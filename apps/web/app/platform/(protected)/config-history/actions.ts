"use server";

import { revalidatePath } from "next/cache";
import {
  listConfigResourceInstances,
  listConfigVersions,
  restoreConfigVersion,
  type ConfigResourceOption,
  type ConfigResourceType,
  type ConfigVersionEntry,
} from "@cofounderai/core/admin/config-history";

/**
 * PLATFORM-P0-17.1/17.3 ("Configuration Versioning", §22). Thin wrappers over
 * `config-history.ts` -- see that file's own top-of-file docstring for the full scope
 * reasoning (which resource types exist, which four have restore wired up).
 */

export async function loadInstancesAction(resourceType: ConfigResourceType): Promise<ConfigResourceOption[]> {
  return listConfigResourceInstances(resourceType);
}

export async function loadVersionsAction(
  resourceType: ConfigResourceType,
  resourceId: string | null,
): Promise<ConfigVersionEntry[]> {
  return listConfigVersions(resourceType, resourceId);
}

export async function restoreVersionAction(
  resourceType: ConfigResourceType,
  resourceId: string | null,
  eventId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await restoreConfigVersion(resourceType, resourceId, eventId, reason);
  if (result.ok) revalidatePath("/platform/config-history");
  return result;
}
