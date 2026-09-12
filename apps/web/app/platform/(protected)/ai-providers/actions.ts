"use server";

import { revalidatePath } from "next/cache";
import {
  removeAiProviderKey,
  setAiProviderKey,
  updateAiProviderConfig,
  type RemoveAiProviderKeyInput,
  type SetAiProviderKeyInput,
  type UpdateAiProviderConfigInput,
} from "@cofounderai/core/admin/platform-ai-providers";

/**
 * PLATFORM-P0-09.1/09.2 ("Internal AI Provider Registry" / "Secure API Key Storage", §13).
 * Every action here is a thin `revalidatePath` wrapper over the one audited mutation path
 * in `platform-ai-providers.ts` -- there is no plain, reason-free mutation anywhere in this
 * file, and no action here ever returns a plaintext or encrypted key to the client.
 */

export async function updateAiProviderConfigAction(
  input: UpdateAiProviderConfigInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await updateAiProviderConfig(input);
  if (!result.ok) return result;
  revalidatePath("/platform/ai-providers");
  return result;
}

export async function setAiProviderKeyAction(
  input: SetAiProviderKeyInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await setAiProviderKey(input);
  if (!result.ok) return result;
  revalidatePath("/platform/ai-providers");
  return result;
}

export async function removeAiProviderKeyAction(
  input: RemoveAiProviderKeyInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await removeAiProviderKey(input);
  if (!result.ok) return result;
  revalidatePath("/platform/ai-providers");
  return result;
}
