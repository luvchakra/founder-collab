"use server";

import { revalidatePath } from "next/cache";
import { hasPermission } from "@cofounderai/core/finance/controls";
import { activateLicense, deactivateLicense } from "@cofounderai/core/licensing/lifecycle";
import type { ModuleKey } from "@cofounderai/core/licensing/types";
import { isModulePaid, listSubscriptionsForBusiness } from "@cofounderai/core/billing/subscriptions";

const SETTINGS_PATH = "/dashboard/settings/licenses";

/**
 * activateLicense()/deactivateLicense() run through the service-role admin client
 * (core.licenses has no client-side write policy -- C-3), which bypasses RLS entirely.
 * businessId arrives here from a submitted form, so it's client-supplied and must be
 * authorized server-side before crossing into that privileged path (CLAUDE.md principle
 * 8). has_permission('billing.manage') covers both membership and role: changing what a
 * business is licensed for is an owner/admin decision, not something every member can do.
 */
async function assertCanManageLicenses(businessId: string): Promise<void> {
  if (!(await hasPermission(businessId, "billing.manage"))) {
    throw new Error("You don't have permission to manage licenses for this business.");
  }
}

export async function activateModuleAction(businessId: string, moduleKey: ModuleKey) {
  await assertCanManageLicenses(businessId);
  // A module sold through billing is only ever activated by a verified payment webhook
  // -- otherwise this button would be a free bypass of checkout.
  if (await isModulePaid(moduleKey)) {
    throw new Error("This module is a paid plan -- subscribe to it from Billing.");
  }
  await activateLicense(businessId, moduleKey);
  revalidatePath(SETTINGS_PATH);
}

export async function deactivateModuleAction(businessId: string, moduleKey: ModuleKey) {
  await assertCanManageLicenses(businessId);
  // Deactivating a module that's still being billed would leave the customer paying for
  // nothing; cancel the subscription instead (its webhook moves the license to grace).
  const subscriptions = await listSubscriptionsForBusiness(businessId);
  if (subscriptions.some((s) => s.module_key === moduleKey && (s.status === "active" || s.status === "past_due"))) {
    throw new Error("This module has an active subscription -- cancel it from Billing.");
  }
  await deactivateLicense(businessId, moduleKey);
  revalidatePath(SETTINGS_PATH);
}
