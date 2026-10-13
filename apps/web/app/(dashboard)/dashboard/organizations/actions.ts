"use server";

import { revalidatePath } from "next/cache";
import { renameMyOrganization, setMyOrganizationDisabled } from "@cofounderai/core/businesses/manage-organizations";
import { orderEnvironment } from "@cofounderai/core/billing/environment-orders";
import type { OrgEnvironment } from "@cofounderai/core/lib/org-address";

// PLATFORM-P1-10.8/10.9: the database checks ownership for every call; these only pass on
// what happened, in words.
function done<T extends { ok: boolean }>(result: T): T {
  if (result.ok) revalidatePath("/dashboard", "layout");
  return result;
}

export async function renameAction(businessId: string, formData: FormData) {
  return done(await renameMyOrganization(businessId, String(formData.get("name") ?? "")));
}

export async function setDisabledAction(businessId: string, disabled: boolean) {
  return done(await setMyOrganizationDisabled(businessId, disabled));
}

export async function orderEnvironmentAction(organizationId: string, formData: FormData) {
  const result = await orderEnvironment(organizationId, String(formData.get("environment") ?? "") as OrgEnvironment);
  return done(result.ok ? { ok: true as const, message: result.message } : result);
}
