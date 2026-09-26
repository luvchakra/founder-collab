"use server";

import { revalidatePath } from "next/cache";
import { revokePlatformApiKey, updateApiPolicy, type UpdateApiPolicyInput } from "@cofounderai/core/admin/platform-api-admin";

/** PLATFORM-P1-06.1/06.2/06.3 -- thin wrappers over the audited API admin functions. */
export async function updateApiPolicyAction(input: UpdateApiPolicyInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await updateApiPolicy(input);
  if (result.ok) revalidatePath("/platform/api");
  return result;
}

export async function revokePlatformApiKeyAction(id: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await revokePlatformApiKey(id, reason);
  if (result.ok) revalidatePath("/platform/api");
  return result;
}
