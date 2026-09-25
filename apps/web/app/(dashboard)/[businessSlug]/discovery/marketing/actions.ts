"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { businessPath } from "@/lib/business-path";
import {
  activateStrategy,
  createCampaign,
  createContent,
  createSeoItem,
  deleteMarketingAsset,
  duplicateContent,
  duplicateCampaign,
  recordCampaignMetric,
  rescheduleContent,
  saveStrategyDraft,
  setSeoItemStatus,
  setStrategyGoals,
  transitionCampaign,
  transitionContent,
  updateCampaign,
  updateContent,
  uploadMarketingAsset,
} from "@cofounderai/module-discovery/lib/marketing/mutations";
import {
  assetInputSchema,
  campaignInputSchema,
  contentInputSchema,
  firstIssue,
  metricSnapshotSchema,
  seoItemInputSchema,
  strategyGoalSchema,
  strategyInputSchema,
} from "@cofounderai/module-discovery/lib/marketing/schemas";
import {
  CAMPAIGN_STATUSES,
  CONTENT_STATUSES,
  SEO_STATUSES,
  type CampaignStatus,
  type ContentStatus,
  type SeoStatus,
  type StrategyGoal,
} from "@cofounderai/module-discovery/lib/marketing/types";
import type { FormState } from "@cofounderai/module-discovery/components/marketing/action-form";

/**
 * MKT-03..12 — the Marketing screens' server actions. Each one only parses the form and
 * hands a validated input to the domain layer (lib/marketing/mutations.ts), which owns the
 * licence check, permission check, tenant-scoped write and audit entry. Nothing here trusts
 * a value the browser sent without parsing it first.
 */

async function base(businessId: string): Promise<string> {
  return `${await businessPath(businessId)}/discovery/marketing`;
}

function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) out[key] = value;
  }
  return out;
}

function failure(error: unknown, fallback: string): FormState {
  const message = error instanceof Error ? error.message : "";
  return { error: message || fallback };
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function createCampaignAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = campaignInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let id: string;
  try {
    id = await createCampaign(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the campaign.");
  }
  const root = await base(businessId);
  revalidatePath(root, "layout");
  redirect(`${root}/campaigns/${id}`);
}

export async function updateCampaignAction(
  businessId: string,
  campaignId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = campaignInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await updateCampaign(businessId, campaignId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the campaign.");
  }
  const root = await base(businessId);
  revalidatePath(root, "layout");
  redirect(`${root}/campaigns/${campaignId}`);
}

export async function transitionCampaignAction(
  businessId: string,
  campaignId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const to = String(formData.get("to") ?? "");
  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(to)) return { error: "Unknown status." };
  try {
    await transitionCampaign(businessId, campaignId, to as CampaignStatus);
  } catch (error) {
    return failure(error, "Could not change the campaign's status.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true };
}

export async function duplicateCampaignAction(
  businessId: string,
  campaignId: string,
): Promise<FormState> {
  let id: string;
  try {
    id = await duplicateCampaign(businessId, campaignId);
  } catch (error) {
    return failure(error, "Could not duplicate the campaign.");
  }
  const root = await base(businessId);
  revalidatePath(root, "layout");
  redirect(`${root}/campaigns/${id}/edit`);
}

export async function recordMetricAction(
  businessId: string,
  campaignId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = metricSnapshotSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await recordCampaignMetric(businessId, campaignId, parsed.data);
  } catch (error) {
    return failure(error, "Could not record these numbers.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true, message: "Numbers recorded." };
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export async function createContentAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = contentInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let id: string;
  try {
    id = await createContent(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the content.");
  }
  const root = await base(businessId);
  revalidatePath(root, "layout");
  redirect(`${root}/content/${id}`);
}

export async function updateContentAction(
  businessId: string,
  contentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = contentInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await updateContent(businessId, contentId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the content.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true, message: "Saved as a new version." };
}

export async function transitionContentAction(
  businessId: string,
  contentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const to = String(formData.get("to") ?? "");
  if (!(CONTENT_STATUSES as readonly string[]).includes(to)) return { error: "Unknown status." };
  const scheduledAt = String(formData.get("scheduledAt") ?? "").trim() || null;
  const externalUrl = String(formData.get("externalUrl") ?? "").trim() || null;
  if (externalUrl && !/^https?:\/\//i.test(externalUrl)) return { error: "Links must start with http:// or https://." };
  if (scheduledAt && Number.isNaN(new Date(scheduledAt).getTime())) return { error: "Enter a valid date and time." };
  try {
    await transitionContent(businessId, contentId, to as ContentStatus, {
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      externalUrl,
    });
  } catch (error) {
    return failure(error, "Could not change the content's status.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true };
}

export async function duplicateContentAction(
  businessId: string,
  contentId: string,
): Promise<FormState> {
  let id: string;
  try {
    id = await duplicateContent(businessId, contentId);
  } catch (error) {
    return failure(error, "Could not duplicate the content.");
  }
  const root = await base(businessId);
  revalidatePath(root, "layout");
  redirect(`${root}/content/${id}`);
}

export async function rescheduleContentAction(
  businessId: string,
  contentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = String(formData.get("scheduledAt") ?? "").trim();
  if (!raw || Number.isNaN(new Date(raw).getTime())) return { error: "Choose a date and time." };
  try {
    await rescheduleContent(businessId, contentId, new Date(raw).toISOString());
  } catch (error) {
    return failure(error, "Could not reschedule.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true, message: "Rescheduled. It still needs someone to publish it." };
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export async function saveStrategyAction(
  businessId: string,
  basedOnId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = strategyInputSchema.safeParse({ ...fields(formData), channels: formData.getAll("channels").map(String) });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await saveStrategyDraft(businessId, parsed.data, basedOnId);
  } catch (error) {
    return failure(error, "Could not save the strategy.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true, message: "Saved as a new draft version. Activate it when it is ready." };
}

export async function activateStrategyAction(
  businessId: string,
  strategyId: string,
): Promise<FormState> {
  try {
    await activateStrategy(businessId, strategyId);
  } catch (error) {
    return failure(error, "Could not activate the strategy.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true };
}

/** Goals arrive as repeated `goal_name`/`goal_metric`/... inputs, one set per row. */
export async function saveStrategyGoalsAction(
  businessId: string,
  strategyId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const names = formData.getAll("goal_name").map(String);
  const metrics = formData.getAll("goal_metric").map(String);
  const targets = formData.getAll("goal_target").map(String);
  const periods = formData.getAll("goal_period").map(String);
  const statuses = formData.getAll("goal_status").map(String);
  const goals: StrategyGoal[] = [];
  for (let i = 0; i < names.length; i += 1) {
    // A wholly blank row is the spare "add a goal" row, not an invalid goal.
    if (!names[i]?.trim() && !metrics[i]?.trim() && !targets[i]?.trim()) continue;
    const parsed = strategyGoalSchema.safeParse({
      name: names[i],
      metric: metrics[i],
      target: targets[i],
      period: periods[i],
      status: statuses[i] || undefined,
    });
    if (!parsed.success) return { error: `Goal ${i + 1}: ${firstIssue(parsed.error)}` };
    goals.push(parsed.data);
  }
  try {
    await setStrategyGoals(businessId, strategyId, goals);
  } catch (error) {
    return failure(error, "Could not save the goals.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true, message: "Goals saved." };
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function uploadAssetAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  const parsed = assetInputSchema.safeParse({ ...fields(formData), name: String(formData.get("name") || file.name) });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await uploadMarketingAsset(businessId, file, parsed.data);
  } catch (error) {
    return failure(error, "Could not upload the file.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true, message: "Uploaded." };
}

export async function deleteAssetAction(
  businessId: string,
  assetId: string,
): Promise<FormState> {
  try {
    await deleteMarketingAsset(businessId, assetId);
  } catch (error) {
    return failure(error, "Could not delete the asset.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Website & SEO
// ---------------------------------------------------------------------------

export async function createSeoItemAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = seoItemInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await createSeoItem(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the opportunity.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true, message: "Added." };
}

export async function setSeoItemStatusAction(
  businessId: string,
  itemId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const status = String(formData.get("status") ?? "");
  if (!(SEO_STATUSES as readonly string[]).includes(status)) return { error: "Unknown status." };
  try {
    await setSeoItemStatus(businessId, itemId, status as SeoStatus);
  } catch (error) {
    return failure(error, "Could not update the opportunity.");
  }
  revalidatePath(await base(businessId), "layout");
  return { success: true };
}
