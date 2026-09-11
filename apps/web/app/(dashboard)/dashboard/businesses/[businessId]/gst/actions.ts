"use server";

import { revalidatePath } from "next/cache";
import { setComplianceCountry } from "@cofounderai/module-gst/lib/compliance/mutations";
import type { CountryBarActionState } from "@cofounderai/module-gst/components/compliance/country-bar";

/** Module-wide (not one leaf page's) action -- the country bar is mounted in
 * `gst/layout.tsx` and applies to every Compliance page, so this lives alongside the
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
