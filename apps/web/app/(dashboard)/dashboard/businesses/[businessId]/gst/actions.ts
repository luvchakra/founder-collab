"use server";

import { revalidatePath } from "next/cache";
import { setComplianceCountry, setComplianceRegime } from "@cofounderai/module-gst/lib/compliance/mutations";
import type { CountryBarActionState } from "@cofounderai/module-gst/components/compliance/country-bar";

/** Module-wide (not one leaf page's) actions -- the country bar is mounted in
 * `gst/layout.tsx` and applies to every Compliance page, so these live alongside the
 * layout rather than under any one route's own `actions.ts`. */
export async function setComplianceCountryAction(
  businessId: string,
  _prevState: CountryBarActionState,
  formData: FormData,
): Promise<CountryBarActionState> {
  const country = String(formData.get("country") ?? "").trim().toUpperCase();

  try {
    await setComplianceCountry(businessId, country);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not switch Compliance country." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}/gst`, "layout");
  return { success: true };
}

/** COMPLY-P0-01.3: switches the regime within the business's current country. Unreachable
 * from today's UI (no P0 country offers more than one regime) but wired end-to-end so a
 * P1 country pack with several regimes needs no new server-side plumbing. */
export async function setComplianceRegimeAction(
  businessId: string,
  _prevState: CountryBarActionState,
  formData: FormData,
): Promise<CountryBarActionState> {
  const regime = String(formData.get("regime") ?? "").trim();

  try {
    await setComplianceRegime(businessId, regime);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not switch tax regime." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}/gst`, "layout");
  return { success: true };
}
