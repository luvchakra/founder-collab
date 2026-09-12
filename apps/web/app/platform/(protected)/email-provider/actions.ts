"use server";

import { revalidatePath } from "next/cache";
import {
  updateEmailProviderConfig,
  type UpdateEmailProviderConfigInput,
} from "@cofounderai/core/admin/platform-email-provider";

/**
 * PLATFORM-P0-11.1 (Email Provider, config-only, §15). A thin `revalidatePath` wrapper over
 * the one audited mutation path in `platform-email-provider.ts` -- there is no plain,
 * reason-free mutation anywhere in this file.
 */
export async function updateEmailProviderConfigAction(
  input: UpdateEmailProviderConfigInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await updateEmailProviderConfig(input);
  if (!result.ok) return result;
  revalidatePath("/platform/email-provider");
  return result;
}
