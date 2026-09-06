"use server";

import { revalidatePath } from "next/cache";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { activateLicense, deactivateLicense } from "@cofounderai/core/licensing/lifecycle";
import type { ModuleKey } from "@cofounderai/core/licensing/types";

const SETTINGS_PATH = "/dashboard/settings/licenses";

/**
 * activateLicense()/deactivateLicense() run through the service-role admin client
 * (core.licenses has no client-side write policy -- C-3), which bypasses RLS entirely.
 * businessId arrives here from a submitted form, so it's client-supplied and must be
 * authorized server-side before crossing into that privileged path (CLAUDE.md principle
 * 8) -- this RLS-scoped read is that check: a business the caller can't see returns zero
 * rows, exactly like every other tenant-scoped query in the app.
 */
async function assertBusinessAccess(businessId: string): Promise<void> {
  const supabase = await createCoreClient({ schema: "core" });
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Business not found or access denied.");
}

export async function activateModuleAction(businessId: string, moduleKey: ModuleKey) {
  await assertBusinessAccess(businessId);
  await activateLicense(businessId, moduleKey);
  revalidatePath(SETTINGS_PATH);
}

export async function deactivateModuleAction(businessId: string, moduleKey: ModuleKey) {
  await assertBusinessAccess(businessId);
  await deactivateLicense(businessId, moduleKey);
  revalidatePath(SETTINGS_PATH);
}
