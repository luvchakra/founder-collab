"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { isValidGstin } from "@cofounderai/core/lib/gst";
import { getJurisdictions } from "@cofounderai/module-gst/lib/compliance/jurisdictions";
import {
  createTaxRegistration,
  setGstRegistrationProfile,
  setPrimaryTaxRegistration,
  setTaxRegistrationStatus,
} from "@cofounderai/module-gst/lib/tax-registrations/mutations";
import { isGstRegistrationType, isGstReturnFrequency } from "@cofounderai/module-gst/lib/tax-registrations/gst-registration-profile";
import type { TaxRegistrationStatus } from "@cofounderai/module-gst/lib/tax-registrations/types";
import type { TaxRegistrationActionState } from "@cofounderai/module-gst/components/registrations/registration-modal";
import type { GstRegistrationProfileActionState } from "@cofounderai/module-gst/components/registrations/registration-profile-modal";

/**
 * COMPLY-P0-04.1 (GSTIN Management). No `requirePermission` call here on top of the
 * mutation layer's own -- unlike `saveGstProfileAction` (whose `upsertGstProfile` only
 * checks `requireModule`), every function in `lib/tax-registrations/mutations.ts` already
 * calls both `requireModule` and `requirePermission("settings.manage")` itself
 * (COMPLY-P0-02.1), matching `gst/actions.ts`'s own compliance-country/regime actions,
 * which call their mutations directly for the same reason.
 */
export async function createTaxRegistrationAction(
  businessId: string,
  _prevState: TaxRegistrationActionState,
  formData: FormData,
): Promise<TaxRegistrationActionState> {
  const country = String(formData.get("country") ?? "").trim().toUpperCase();
  const regime = String(formData.get("regime") ?? "").trim();
  const registrationNumber = String(formData.get("registration_number") ?? "").trim().toUpperCase();
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
  const isPrimary = formData.get("is_primary") === "on";
  const isIndiaGst = country === "IN" && regime === "GST";

  if (isIndiaGst && !isValidGstin(registrationNumber)) {
    return { error: "That GSTIN doesn't look valid — check the 15 characters and try again." };
  }
  if (!registrationNumber) {
    return { error: "A registration number is required." };
  }
  // Only a country with a real jurisdiction catalog (India, US, Canada today) requires
  // one -- the five EU VAT countries have no sub-national jurisdiction concept, so the
  // modal never even shows that field for them (RegistrationModal's own doc comment).
  if (getJurisdictions(country).length > 0 && !jurisdiction) {
    return { error: "Select the jurisdiction this registration is for." };
  }

  try {
    await createTaxRegistration(businessId, {
      country,
      regime,
      registrationNumber,
      jurisdiction: jurisdiction || null,
      isPrimary,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add this registration." };
  }

  revalidatePath(`${await businessPath(businessId)}/compliance/registrations`);
  return { success: true };
}

export async function setPrimaryTaxRegistrationAction(businessId: string, registrationId: string): Promise<void> {
  await setPrimaryTaxRegistration(businessId, registrationId);
  revalidatePath(`${await businessPath(businessId)}/compliance/registrations`);
}

export async function setTaxRegistrationStatusAction(
  businessId: string,
  registrationId: string,
  status: TaxRegistrationStatus,
): Promise<void> {
  await setTaxRegistrationStatus(businessId, registrationId, status);
  revalidatePath(`${await businessPath(businessId)}/compliance/registrations`);
}

/**
 * COMPLY-P0-04.2 (GST Profile). Validates the enum fields here (matching
 * `createTaxRegistrationAction`'s own GSTIN-format-check precedent) even though
 * `setGstRegistrationProfile` would also reject a bad value via its own type -- a native
 * `<select>` can't submit anything but its own `<option>` values, but defense in depth
 * costs nothing here and matches this route's existing convention.
 */
export async function setGstRegistrationProfileAction(
  businessId: string,
  registrationId: string,
  _prevState: GstRegistrationProfileActionState,
  formData: FormData,
): Promise<GstRegistrationProfileActionState> {
  const registrationType = String(formData.get("registration_type") ?? "");
  const returnFrequency = String(formData.get("return_frequency") ?? "");
  const registeredFrom = String(formData.get("registered_from") ?? "").trim() || null;
  const eInvoiceEligible = formData.get("e_invoice_eligible") === "on";

  if (!isGstRegistrationType(registrationType)) {
    return { error: "Select a valid registration type." };
  }
  if (!isGstReturnFrequency(returnFrequency)) {
    return { error: "Select a valid return filing frequency." };
  }

  try {
    await setGstRegistrationProfile(businessId, registrationId, {
      registeredFrom,
      profile: { registrationType, returnFrequency, eInvoiceEligible },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save this registration's GST profile." };
  }

  revalidatePath(`${await businessPath(businessId)}/compliance/registrations`);
  return { success: true };
}
