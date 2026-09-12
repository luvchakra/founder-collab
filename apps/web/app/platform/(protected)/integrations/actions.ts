"use server";

import { revalidatePath } from "next/cache";
import {
  listIntegrationRegistry,
  setIntegrationStatus,
  type IntegrationRegistryEntry,
  type SetIntegrationStatusInput,
} from "@cofounderai/core/admin/platform-integrations";

export async function listIntegrationRegistryAction(): Promise<IntegrationRegistryEntry[]> {
  return listIntegrationRegistry();
}

/** PLATFORM-P0-12.2/12.3 -- the ONE way to change an integration category's platform-wide
 * status from the UI, including into/out of `disabled` (the emergency kill switch). See
 * `setIntegrationStatus()`'s own docstring for why there is no separate "enabled" action. */
export async function setIntegrationStatusAction(
  input: SetIntegrationStatusInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setIntegrationStatus(input);
  if (!result.ok) return result;
  revalidatePath("/platform/integrations");
  return { ok: true };
}
