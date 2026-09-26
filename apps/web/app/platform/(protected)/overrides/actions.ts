"use server";

import { revalidatePath } from "next/cache";
import {
  createBusinessOverride,
  revokeBusinessOverride,
  type CreateBusinessOverrideInput,
} from "@cofounderai/core/admin/platform-business-overrides";

/** PLATFORM-P1-02.1/02.2/02.3 -- thin wrappers over the audited override functions. */
export async function createBusinessOverrideAction(input: CreateBusinessOverrideInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await createBusinessOverride(input);
  if (result.ok) revalidatePath("/platform/overrides");
  return result;
}

export async function revokeBusinessOverrideAction(id: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await revokeBusinessOverride(id, reason);
  if (result.ok) revalidatePath("/platform/overrides");
  return result;
}
