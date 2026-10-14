"use server";

import { revalidatePath } from "next/cache";
import {
  changeAddress,
  createEnvironment,
  removeEnvironment,
  removeOrganization,
  renameOrganization,
  saveOrganizationProfile,
  setBusinessNotes,
  setBusinessStatus,
  setEnvironmentType,
  setOrganizationPlan,
  type ConsoleResult,
} from "@cofounderai/core/admin/platform-organizations";
import type { OrgEnvironment } from "@cofounderai/core/lib/org-address";

// PLATFORM-P1-10.10/10.11/10.12: thin wrappers. Authorization (superadmin), validation and the
// audit trail live in core and the database; every result says what actually happened.
function done(result: ConsoleResult): ConsoleResult {
  if (result.ok) {
    revalidatePath("/platform/organizations", "layout");
    revalidatePath("/platform/audit");
  }
  return result;
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

export async function createEnvironmentAction(organizationId: string, formData: FormData) {
  return done(await createEnvironment(organizationId, text(formData, "environment") as OrgEnvironment));
}
export async function removeEnvironmentAction(businessId: string) {
  return done(await removeEnvironment(businessId));
}
export async function removeOrganizationAction(businessId: string) {
  return done(await removeOrganization(businessId));
}
export async function renameOrganizationAction(businessId: string, formData: FormData) {
  return done(await renameOrganization(businessId, text(formData, "name")));
}
export async function changeAddressAction(businessId: string, formData: FormData) {
  return done(await changeAddress(businessId, text(formData, "slug")));
}
export async function setEnvironmentTypeAction(businessId: string, formData: FormData) {
  return done(await setEnvironmentType(businessId, text(formData, "environment") as OrgEnvironment));
}
export async function setNotesAction(businessId: string, formData: FormData) {
  return done(await setBusinessNotes(businessId, text(formData, "notes")));
}
export async function suspendAction(businessId: string, formData: FormData) {
  return done(await setBusinessStatus(businessId, "suspended", text(formData, "reason")));
}
export async function activateAction(businessId: string) {
  return done(await setBusinessStatus(businessId, "active", ""));
}
export async function setPlanAction(organizationId: string, formData: FormData) {
  return done(await setOrganizationPlan(organizationId, text(formData, "plan")));
}
export async function saveProfileAction(organizationId: string, formData: FormData) {
  const keys = ["description", "contactName", "contactEmail", "contactPhone", "companyName", "companyEmail", "companyPhone", "industry", "userBaseSize", "country", "website"] as const;
  return done(await saveOrganizationProfile(organizationId, Object.fromEntries(keys.map((k) => [k, text(formData, k)]))));
}
