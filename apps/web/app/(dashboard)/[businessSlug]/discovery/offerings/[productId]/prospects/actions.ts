"use server";

import { businessPath } from "@/lib/business-path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createProspect } from "@cofounderai/module-discovery/lib/prospects/mutations";
import { findDuplicateProspect } from "@cofounderai/module-discovery/lib/prospects/duplicates";
import {
  bulkResearchProspects,
  bulkScoreProspects,
} from "@cofounderai/module-discovery/lib/prospects/bulk-actions";
import {
  autoDiscoverOneProspect,
  type AutoPopulateProspectsResult,
} from "@cofounderai/module-discovery/lib/ai-approval/auto-populate";

async function prospectsPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/prospects`;
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
    revalidatePath(await prospectsPath(businessId, productId));
    redirect(`${await prospectsPath(businessId, productId)}/${duplicate.id}?duplicate=1`);
  }

  const prospect = await createProspect(workspaceId, {
    companyName,
    website,
    industry: String(formData.get("industry") ?? ""),
    companySize: String(formData.get("companySize") ?? ""),
    location: String(formData.get("location") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  revalidatePath(await prospectsPath(businessId, productId));
  redirect(`${await prospectsPath(businessId, productId)}/${prospect.id}`);
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
  revalidatePath(await prospectsPath(businessId, productId));
  redirect(`${await prospectsPath(businessId, productId)}?${bulkResultQuery("research", result)}`);
}

/**
 * The Prospects step of the Overview page's "Let AI Auto-Populate Info" flow (called
 * directly from the client `AutoPopulateStepBanner`, not through a `<form>`). What it may
 * approve is decided on the server from the workspace's own business setting
 * (DISC-AI-APPROVAL-01, `autoDiscoverOneProspect`): "Approve automatically" adds the one
 * company found as a prospect and drafts its research, score, strategy and message;
 * "Review each step" leaves it as a suggestion on the Discover page. Nothing is sent in
 * either mode.
 */
export async function autoDiscoverOneProspectAction(
  businessId: string,
  productId: string,
  workspaceId: string,
): Promise<AutoPopulateProspectsResult> {
  const result = await autoDiscoverOneProspect(workspaceId);
  revalidatePath(await prospectsPath(businessId, productId));
  return result;
}

export async function bulkScoreAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  const result = await bulkScoreProspects(workspaceId, ids);
  revalidatePath(await prospectsPath(businessId, productId));
  redirect(`${await prospectsPath(businessId, productId)}?${bulkResultQuery("score", result)}`);
}
