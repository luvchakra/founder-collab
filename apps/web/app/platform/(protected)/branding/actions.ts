"use server";

import { revalidatePath } from "next/cache";
import {
  saveBrandingDraft,
  publishBrandingDraft,
  discardBrandingDraft,
  type PlatformBrandingInput,
} from "@cofounderai/core/admin/platform-branding";

export type BrandingFormState =
  | { status: "error"; fieldErrors: Record<string, string> }
  | { status: "success" }
  | null;

/** PLATFORM-P0-03.5: revalidate both branding surfaces after any draft/publish/discard
 * mutation -- the Edit page shows the draft banner, the Preview page renders the draft
 * itself, and either can be the page the superadmin is looking at when they act. */
function revalidateBrandingPages() {
  revalidatePath("/platform/branding");
  revalidatePath("/platform/branding/preview");
}

/** Thin wrapper around `saveBrandingDraft()` -- all real validation/authorization lives in
 * packages/core (shared with any future non-form caller, e.g. a future config-import job
 * from PLATFORM-P1-01). Reads every field as plain strings straight off the form;
 * `saveBrandingDraft()`'s own Zod schema turns "" into null for optional fields.
 *
 * PLATFORM-P0-03.5 ("Preview Before Publish"): this used to call the now-removed
 * `updatePlatformBranding()`, which took effect immediately. It now saves a *draft*
 * instead -- live values (and everything that reads them, e.g. the public login page)
 * are untouched until a separate `publishBrandingAction()` call. */
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
    loginBackgroundStyle: String(formData.get("loginBackgroundStyle") ?? "gradient") as PlatformBrandingInput["loginBackgroundStyle"],
    loginBackgroundValue: String(formData.get("loginBackgroundValue") ?? ""),
    loginTermsUrl: String(formData.get("loginTermsUrl") ?? ""),
    loginPrivacyUrl: String(formData.get("loginPrivacyUrl") ?? ""),
  };

  const result = await saveBrandingDraft(input);
  if (!result.ok) {
    return { status: "error", fieldErrors: result.fieldErrors };
  }

  revalidateBrandingPages();
  return { status: "success" };
}

export type PublishResult = { ok: true } | { ok: false; error: string };

/** PLATFORM-P0-03.5: the Publish step -- called from the confirm-dialog "Publish" button
 * on both the Edit and Preview pages (`publish-controls.tsx`), never automatically. */
export async function publishBrandingAction(): Promise<PublishResult> {
  const result = await publishBrandingDraft();
  if (!result.ok) return { ok: false, error: result.error };
  revalidateBrandingPages();
  return { ok: true };
}

/** PLATFORM-P0-03.5: abandons the pending draft without publishing it. */
export async function discardBrandingAction(): Promise<PublishResult> {
  await discardBrandingDraft();
  revalidateBrandingPages();
  return { ok: true };
}
