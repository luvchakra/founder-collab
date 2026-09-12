"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createBusiness, createProduct } from "@cofounderai/module-discovery/lib/tenancy/mutations";
import { normalizeWebsiteUrl } from "@cofounderai/module-discovery/lib/website-onboarding/url";
import { createWebsiteOnboardingRun } from "@cofounderai/module-discovery/lib/website-onboarding/mutations";

export async function createBusinessAction(accountId: string, formData: FormData) {
  const business = await createBusiness(accountId, {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    website: String(formData.get("website") ?? ""),
    industry: String(formData.get("industry") ?? ""),
  });
  revalidatePath("/dashboard");
  redirect(`/dashboard/businesses/${business.id}`);
}

export type CreateBusinessFromWebsiteState = { error: string } | null;

/**
 * "Create from website" tab of CreateBusinessModal -- DISC-OFFER-P0-09.1's own "Website
 * URL Business Onboarding" entry point. Validates/normalizes the URL first (§26's own
 * "Invalid URL" failure state, returned as action state rather than thrown so the modal
 * can show it inline and let the founder fix it, the same useActionState shape
 * runOnboardingAction already established) and creates the business immediately from a
 * placeholder name derived from the domain -- unchanged from before.
 *
 * What changed from the old synchronous version: this action no longer calls the AI
 * itself. Understanding the website used to run inline here (blocking the redirect on
 * one whole research+structure call, with a failure only ever logged to the server
 * console -- invisible to the founder, and not "recoverable" in any real sense). Now it
 * only records a `pending` discovery.website_onboarding_runs row and redirects
 * immediately; the actual research happens on the Business detail page itself (a
 * WebsiteOnboardingPanel driving the new streaming route handler), where its progress is
 * visible, a failure is shown with a real Retry action, and the founder reviews every
 * extracted field -- including business_name/description -- before anything is applied,
 * rather than having it silently overwrite the business's own name/description the way
 * the old inline call did.
 */
export async function createBusinessFromWebsiteAction(
  accountId: string,
  _prevState: CreateBusinessFromWebsiteState,
  formData: FormData,
): Promise<CreateBusinessFromWebsiteState> {
  const rawWebsite = String(formData.get("website") ?? "");
  const normalized = normalizeWebsiteUrl(rawWebsite);
  if (!normalized.ok) {
    return { error: normalized.error };
  }
  const website = normalized.url;

  const placeholderName = new URL(website).hostname.replace(/^www\./, "");
  const business = await createBusiness(accountId, { name: placeholderName, website });
  await createWebsiteOnboardingRun(business.id, website);

  revalidatePath("/dashboard");
  redirect(`/dashboard/businesses/${business.id}/business`);
}

export async function createProductAction(businessId: string, formData: FormData) {
  const product = await createProduct(businessId, {
    name: String(formData.get("name") ?? ""),
    website: String(formData.get("website") ?? ""),
  });
  revalidatePath(`/dashboard/businesses/${businessId}`);
  redirect(`/dashboard/businesses/${businessId}/products/${product.id}`);
}
