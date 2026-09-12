"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  updateBusiness,
  createProductsBulk,
  deleteProduct,
  disableProduct,
  enableProduct,
} from "@cofounderai/module-discovery/lib/tenancy/mutations";
import {
  createOffering,
  duplicateOffering,
  setOfferingStatus,
  updateOfferingProfile,
} from "@cofounderai/module-discovery/lib/offerings/mutations";
import { suggestOfferingProfile } from "@cofounderai/module-discovery/lib/offerings/ai/suggest-offering-profile";
import { updateProduct } from "@cofounderai/module-discovery/lib/tenancy/mutations";
import type { OfferingStatus, OfferingType } from "@cofounderai/module-discovery/lib/offerings/types";
import type { OfferingProfileSuggestion } from "@cofounderai/module-discovery/lib/ai/schemas";
import {
  parseProductImportFile,
  type ProductImportRow,
  type ProductImportPreviewResult,
} from "@cofounderai/module-discovery/lib/tenancy/parse-products-import";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getLatestWebsiteOnboardingRun } from "@cofounderai/module-discovery/lib/website-onboarding/queries";
import { createWebsiteOnboardingRun } from "@cofounderai/module-discovery/lib/website-onboarding/mutations";
import type { WebsiteOnboardingRun } from "@cofounderai/module-discovery/lib/website-onboarding/types";

export async function renameBusinessAction(
  businessId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  try {
    await updateBusiness(businessId, { name });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath("/dashboard"); // sidebar and header business selector also show the name
  return { success: true };
}

export async function updateBusinessDescriptionAction(
  businessId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const description = String(formData.get("value") ?? "");

  try {
    await updateBusiness(businessId, { description });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

export async function updateBusinessWebsiteAction(
  businessId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const website = String(formData.get("value") ?? "");

  try {
    await updateBusiness(businessId, { website });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

/**
 * Step 1 of the business page's product-catalog import: parses the uploaded file and
 * returns every row, not just a preview slice -- the client component holds the full
 * array and renders only the first few, then hands the same array straight to
 * `importProductsAction` on confirm (no second upload/parse needed, and nothing is
 * written to the database yet at this step).
 */
export async function previewProductImportAction(
  _businessId: string,
  _prevState: ProductImportPreviewResult | null,
  formData: FormData,
): Promise<ProductImportPreviewResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to preview." };
  }

  try {
    const { rows, errors, usedFallback } = await parseProductImportFile(file);
    if (rows.length === 0) {
      return { error: errors[0] ?? "Could not find any products in that file." };
    }
    return { rows, errors, usedFallback };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not read that file." };
  }
}

/** Step 2: actually creates the products, from the rows step 1 already parsed and the
 * founder already reviewed -- called directly (not through a <form>), since the rows
 * live in the client component's own state by this point, not in a fresh FormData. */
export async function importProductsAction(
  businessId: string,
  rows: ProductImportRow[],
): Promise<{ inserted: number; duplicates: number }> {
  const result = await createProductsBulk(businessId, rows);
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return result;
}

export async function deleteProductAction(
  businessId: string,
  productId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteProduct(productId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not delete this product." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

export async function disableProductAction(
  businessId: string,
  productId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await disableProduct(productId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not disable this product." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

export async function enableProductAction(
  businessId: string,
  productId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await enableProduct(productId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not enable this product." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

/** DISC-OFFER-P0-01.3's own field set, read from the create/edit dialog's FormData --
 * both actions below share this rather than each re-listing all nine fields. */
function offeringInputFromFormData(formData: FormData) {
  const text = (key: string) => String(formData.get(key) ?? "").trim() || null;
  const offeringType = text("offeringType") as OfferingType | null;
  return {
    name: String(formData.get("name") ?? "").trim(),
    website: text("website"),
    description: text("description"),
    category: text("category"),
    offeringType,
    valueProposition: text("valueProposition"),
    primaryProblem: text("primaryProblem"),
    targetMarket: text("targetMarket"),
    detailedDescription: text("detailedDescription"),
  };
}

export async function createOfferingAction(
  businessId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const input = offeringInputFromFormData(formData);
  if (!input.name) return { error: "Name is required." };

  try {
    await createOffering(businessId, input);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not create this offering." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

/** Writes through both `updateProduct()` (name/description/website -- the fields every
 * existing caller of that function already edits) and `updateOfferingProfile()` (the
 * new fields) -- one dialog submit, two calls onto the same row, same reasoning
 * `lib/offerings/mutations.ts`'s own doc comment gives for keeping them separate
 * functions. */
export async function updateOfferingAction(
  businessId: string,
  offeringId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const input = offeringInputFromFormData(formData);
  if (!input.name) return { error: "Name is required." };

  try {
    await updateProduct(offeringId, { name: input.name, description: input.description ?? "", website: input.website ?? "" });
    await updateOfferingProfile(offeringId, {
      category: input.category,
      offeringType: input.offeringType,
      valueProposition: input.valueProposition,
      primaryProblem: input.primaryProblem,
      targetMarket: input.targetMarket,
      detailedDescription: input.detailedDescription,
    });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not update this offering." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

export async function setOfferingStatusAction(
  businessId: string,
  offeringId: string,
  status: OfferingStatus,
): Promise<{ error: string } | { success: true }> {
  try {
    await setOfferingStatus(offeringId, status);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not change this offering's status." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

/**
 * DISC-OFFER-P0-02.1's "Suggest fields" -- only ever called from the Edit dialog on an
 * already-created offering (see `suggestOfferingProfile()`'s own doc comment for why:
 * AI-usage accounting is workspace-scoped, and a not-yet-created offering has none
 * yet). Returns the suggestion for the dialog to pre-fill as *editable* values, never
 * writes it anywhere itself.
 */
export async function suggestOfferingProfileAction(
  _businessId: string,
  offeringId: string,
  description: string,
): Promise<{ error: string } | { success: true; suggestion: OfferingProfileSuggestion }> {
  try {
    const suggestion = await suggestOfferingProfile(offeringId, description);
    return { success: true, suggestion };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not suggest fields for this offering." };
  }
}

export async function duplicateOfferingAction(
  businessId: string,
  offeringId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await duplicateOffering(businessId, offeringId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not duplicate this offering." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

/**
 * DISC-OFFER-P0-09.1's own "Errors are recoverable" -- a failed website onboarding run
 * gets a fresh `pending` row for the same business/website rather than reusing (and
 * losing) the failed one, the same append-style precedent this backlog already
 * established for ai_runs/prospect_scores. The panel picks the new row up immediately
 * (getLatestWebsiteOnboardingRun always returns the most recent) and starts driving it
 * the same way it drove the first one.
 */
export async function retryWebsiteOnboardingAction(
  businessId: string,
): Promise<{ error: string } | { success: true; run: WebsiteOnboardingRun }> {
  try {
    const business = await getBusiness(businessId);
    if (!business) return { error: "Business not found." };
    if (!business.website) return { error: "This business has no website on file to retry." };
    const run = await createWebsiteOnboardingRun(businessId, business.website);
    return { success: true, run };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not start a new onboarding run." };
  }
}

/**
 * The one write DISC-OFFER-P0-09.1's review panel offers: applying the run's own
 * business_name/description onto the real business row -- explicit, founder-triggered,
 * never automatic, per this backlog's own established "AI suggestions are always
 * editable proposals, never silently auto-saved as fact" discipline (the *old*
 * createBusinessFromWebsiteAction did overwrite these silently; this replaces that with
 * a real review step). Every other field this run extracted (products/services,
 * industries, pricing hints, etc.) has nowhere to be "applied" yet -- turning them into
 * real Offering/ICP rows is DISC-OFFER-P0-09.3/09.4's own job, not this story's.
 */
export async function applyWebsiteOnboardingProfileAction(
  businessId: string,
): Promise<{ error: string } | { success: true }> {
  const run = await getLatestWebsiteOnboardingRun(businessId);
  if (!run || run.status !== "succeeded" || !run.profile) {
    return { error: "No completed onboarding profile to apply yet." };
  }

  const { business_name, description } = run.profile;
  const patch: { name?: string; description?: string } = {};
  if (business_name.status !== "unknown" && business_name.value) patch.name = business_name.value;
  if (description.status !== "unknown" && description.value) patch.description = description.value;
  if (Object.keys(patch).length === 0) {
    return { error: "Nothing usable to apply from this profile." };
  }

  try {
    await updateBusiness(businessId, patch);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not update the business." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}
