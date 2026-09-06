"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createProspect } from "@cofounderai/module-discovery/lib/prospects/mutations";
import { findDuplicateProspect } from "@cofounderai/module-discovery/lib/prospects/duplicates";
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
