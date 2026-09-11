"use server";

import { revalidatePath } from "next/cache";
import {
  updatePlatformBranding,
  type PlatformBrandingInput,
} from "@cofounderai/core/admin/platform-branding";

export type BrandingFormState =
  | { status: "error"; fieldErrors: Record<string, string> }
  | { status: "success" }
  | null;

/** Thin wrapper around `updatePlatformBranding()` -- all real validation/authorization
 * lives in packages/core (shared with any future non-form caller, e.g. a future
 * config-import job from PLATFORM-P1-01). Reads every field as plain strings straight off
 * the form; `updatePlatformBranding()`'s own Zod schema turns "" into null for optional
 * fields. */
export async function saveBrandingAction(
  _prevState: BrandingFormState,
  formData: FormData,
): Promise<BrandingFormState> {
  const input: PlatformBrandingInput = {
    platformName: String(formData.get("platformName") ?? ""),
    logoUrl: String(formData.get("logoUrl") ?? ""),
    faviconUrl: String(formData.get("faviconUrl") ?? ""),
    primaryColor: String(formData.get("primaryColor") ?? ""),
    secondaryColor: String(formData.get("secondaryColor") ?? ""),
    accentColor: String(formData.get("accentColor") ?? ""),
    loginHeadline: String(formData.get("loginHeadline") ?? ""),
    loginSupportText: String(formData.get("loginSupportText") ?? ""),
    emailFromName: String(formData.get("emailFromName") ?? ""),
    footerText: String(formData.get("footerText") ?? ""),
    supportEmail: String(formData.get("supportEmail") ?? ""),
    supportUrl: String(formData.get("supportUrl") ?? ""),
  };

  const result = await updatePlatformBranding(input);
  if (!result.ok) {
    return { status: "error", fieldErrors: result.fieldErrors };
  }

  revalidatePath("/platform/branding");
  return { status: "success" };
}
