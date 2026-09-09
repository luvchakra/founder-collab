"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createProspect, approveProspectSuggestions } from "@cofounderai/module-discovery/lib/prospects/mutations";
import { findDuplicateProspect } from "@cofounderai/module-discovery/lib/prospects/duplicates";
import { discoverProspects } from "@cofounderai/module-discovery/lib/ai/discover-prospects";
import {
  bulkResearchProspects,
  bulkScoreProspects,
} from "@cofounderai/module-discovery/lib/prospects/bulk-actions";

function prospectsPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/prospects`;
}

export async function createProspectAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const companyName = String(formData.get("companyName") ?? "");
  const website = String(formData.get("website") ?? "");

  const duplicate = await findDuplicateProspect(workspaceId, { companyName, website });
  if (duplicate) {
    revalidatePath(prospectsPath(businessId, productId));
    redirect(`${prospectsPath(businessId, productId)}/${duplicate.id}?duplicate=1`);
  }

  const prospect = await createProspect(workspaceId, {
    companyName,
    website,
    industry: String(formData.get("industry") ?? ""),
    companySize: String(formData.get("companySize") ?? ""),
    location: String(formData.get("location") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  revalidatePath(prospectsPath(businessId, productId));
  redirect(`${prospectsPath(businessId, productId)}/${prospect.id}`);
}

function bulkResultQuery(action: string, result: { completed: number; skipped: number; limitReached: boolean }) {
  return `bulkAction=${action}&bulkCompleted=${result.completed}&bulkSkipped=${result.skipped}&bulkLimit=${result.limitReached ? 1 : 0}`;
}

export async function bulkResearchAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  const result = await bulkResearchProspects(workspaceId, ids);
  revalidatePath(prospectsPath(businessId, productId));
  redirect(`${prospectsPath(businessId, productId)}?${bulkResultQuery("research", result)}`);
}

/**
 * The Prospects step of the Overview page's "Let AI Auto-Populate Info" flow (called
 * directly from the client `AutoPopulateRunner`, not through a `<form>`): searches for
 * exactly one prospect (`discoverProspects`'s own `maxResults` -- deliberately smaller
 * than the manual Discover page's default of 10, so a first-time setup costs one
 * company's worth of search tokens) and immediately approves it into the real pipeline,
 * rather than leaving it as a suggestion the founder has to separately review -- the
 * whole point of auto-populate is a populated Prospects page to land on. Returns the
 * count actually added (0 if the search found nothing, e.g. an unusually narrow ICP) so
 * the runner can adjust its closing message.
 */
export async function autoDiscoverOneProspectAction(
  businessId: string,
  productId: string,
  workspaceId: string,
): Promise<number> {
  const suggestions = await discoverProspects(workspaceId, undefined, 1);
  if (suggestions.length === 0) return 0;
  const added = await approveProspectSuggestions(workspaceId, suggestions.map((s) => s.id));
  revalidatePath(prospectsPath(businessId, productId));
  return added;
}

export async function bulkScoreAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  const result = await bulkScoreProspects(workspaceId, ids);
  revalidatePath(prospectsPath(businessId, productId));
  redirect(`${prospectsPath(businessId, productId)}?${bulkResultQuery("score", result)}`);
}
