"use server";

import { revalidatePath } from "next/cache";
import {
  updateAiProviderRouting,
  type UpdateAiProviderRoutingInput,
} from "@cofounderai/core/admin/platform-ai-provider-routing";

/**
 * PLATFORM-P0-09.3 (Provider Routing, config-only, §13). A thin `revalidatePath` wrapper
 * over the one audited mutation path in `platform-ai-provider-routing.ts` -- there is no
 * plain, reason-free mutation anywhere in this file.
 */
export async function updateAiProviderRoutingAction(
  input: UpdateAiProviderRoutingInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await updateAiProviderRouting(input);
  if (!result.ok) return result;
  revalidatePath("/platform/ai-routing");
  return result;
}
