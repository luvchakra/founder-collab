"use server";

import { revalidatePath } from "next/cache";
import { generateIcp } from "@cofounderai/module-discovery/lib/ai/generate-icp";
import {
  updateIcpProfile,
  approveIcpProfile,
  cloneIcpProfileToWorkspace,
  parseListField,
} from "@cofounderai/module-discovery/lib/icp/mutations";
import { getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";

function icpPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/icp`;
}

export async function generateIcpAction(
  businessId: string,
  productId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const force = formData.get("force") === "true";
    await generateIcp(productId, { force });
    revalidatePath(icpPath(businessId, productId));
  });
}

export async function updateIcpAction(
  businessId: string,
  productId: string,
  icpId: string,
  formData: FormData,
) {
  await updateIcpProfile(icpId, {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    industries: parseListField(String(formData.get("industries") ?? "")),
    companySizes: parseListField(String(formData.get("companySizes") ?? "")),
    geographies: parseListField(String(formData.get("geographies") ?? "")),
    roles: parseListField(String(formData.get("roles") ?? "")),
    painPoints: parseListField(String(formData.get("painPoints") ?? "")),
    buyingSignals: parseListField(String(formData.get("buyingSignals") ?? "")),
    exclusions: parseListField(String(formData.get("exclusions") ?? "")),
    revenue: parseListField(String(formData.get("revenue") ?? "")),
    businessModel: parseListField(String(formData.get("businessModel") ?? "")),
    technology: parseListField(String(formData.get("technology") ?? "")),
    growthStage: parseListField(String(formData.get("growthStage") ?? "")),
    existingTools: parseListField(String(formData.get("existingTools") ?? "")),
  });
  revalidatePath(icpPath(businessId, productId));
}

/** DISC-OFFER-P0-02.2's "ICP can be cloned" -- clones another offering's ICP onto this
 * one's own workspace (creating it if this offering had none, overwriting if it did). */
export async function cloneIcpAction(businessId: string, productId: string, sourceIcpId: string): Promise<{ error: string } | { success: true }> {
  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) return { error: "Workspace not found for this offering." };

  try {
    await cloneIcpProfileToWorkspace(sourceIcpId, workspace.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not clone this ICP." };
  }
  revalidatePath(icpPath(businessId, productId));
  return { success: true };
}

export async function approveIcpAction(
  businessId: string,
  productId: string,
  icpId: string,
) {
  await approveIcpProfile(icpId);
  revalidatePath(icpPath(businessId, productId));
}

/**
 * The ICP step of the Overview page's "Let AI Auto-Populate Info" flow (called directly
 * from the client `AutoPopulateRunner` as it walks Overview -> ICP -> Prospects, not
 * through a `<form>`): generates a fresh ICP and immediately approves it, so
 * `discoverProspects()` (which requires an approved ICP) can run right after without a
 * separate manual approval click. Thrown errors propagate to the caller as-is -- the
 * runner's own try/catch turns them into its step-failed UI.
 */
export async function autoPopulateIcpAction(businessId: string, productId: string): Promise<void> {
  const icp = await generateIcp(productId, { force: true });
  await approveIcpProfile(icp.id);
  revalidatePath(icpPath(businessId, productId));
}
