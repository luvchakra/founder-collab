"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addFileKnowledgeSource,
  addKnowledgeSource,
  deleteKnowledgeSource,
  updateKnowledgeSource,
} from "@cofounderai/module-discovery/lib/knowledge/mutations";
import { updateProduct, setRediscoveryInterval } from "@cofounderai/module-discovery/lib/tenancy/mutations";
import type { RediscoveryInterval } from "@cofounderai/module-discovery/lib/tenancy/rediscovery";
import { understandProduct } from "@cofounderai/module-discovery/lib/ai/understand-product";
import { setOpportunityStatus, recordOpportunityHandoffFailure } from "@cofounderai/module-discovery/lib/opportunities/mutations";
import type { OpportunityStatus } from "@cofounderai/module-discovery/lib/opportunities/types";
import { promoteProspectToCrm } from "@cofounderai/module-crm/contract/index";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";

function productPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}`;
}

export async function renameProductAction(
  businessId: string,
  productId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  try {
    await updateProduct(productId, { name });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(productPath(businessId, productId));
  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateProductDescriptionAction(
  businessId: string,
  productId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const description = String(formData.get("value") ?? "");

  try {
    await updateProduct(productId, { description });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(productPath(businessId, productId));
  return { success: true };
}

export async function updateProductWebsiteAction(
  businessId: string,
  productId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const website = String(formData.get("value") ?? "");

  try {
    await updateProduct(productId, { website });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(productPath(businessId, productId));
  return { success: true };
}

export async function addFileSourceAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw new Error("Choose at least one file to upload.");
  }
  // Sequential, not Promise.all -- each upload also mints its own storage path from
  // Date.now() (addFileKnowledgeSource's own dedup key), and concurrent calls in the
  // same tick could collide on that timestamp.
  for (const file of files) {
    await addFileKnowledgeSource(workspaceId, file);
  }
  revalidatePath(productPath(businessId, productId));
}

export async function addTextSourceAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const content = String(formData.get("content") ?? "");
  const sourceName = String(formData.get("sourceName") ?? "");
  await addKnowledgeSource(workspaceId, { sourceType: "manual", sourceName, content });
  revalidatePath(productPath(businessId, productId));
}

export async function deleteSourceAction(
  businessId: string,
  productId: string,
  sourceId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteKnowledgeSource(sourceId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not delete this source." };
  }
  revalidatePath(productPath(businessId, productId));
  return { success: true };
}

export async function updateSourceAction(
  businessId: string,
  productId: string,
  sourceId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const content = String(formData.get("value") ?? "");

  try {
    await updateKnowledgeSource(sourceId, content);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(productPath(businessId, productId));
  return { success: true };
}

/**
 * DISC-OFFER-P0-15.1: the Overview page's own "Top Opportunity" gate card's
 * `Watch`/`Dismiss` buttons -- a plain, self-contained status write, the same
 * `setOpportunityStatus` (05.1) mutation the Opportunity Detail page's own status
 * picker already uses, bound to a specific status here instead of read from a form
 * field (the gate's own buttons are one-click, no dropdown to choose from).
 */
export async function updateTopOpportunityStatusAction(
  businessId: string,
  productId: string,
  opportunityId: string,
  status: OpportunityStatus,
): Promise<void> {
  await setOpportunityStatus(opportunityId, status);
  revalidatePath(productPath(businessId, productId));
  revalidatePath(`/dashboard/businesses/${businessId}/products/${productId}/opportunities`);
  revalidatePath(`/dashboard/businesses/${businessId}/products/${productId}/opportunities/${opportunityId}`);
}

/**
 * DISC-OFFER-P0-15.1: the gate card's own "Send to CRM" -- identical logic to
 * `sendOpportunityToCrmAction` (DISC-OFFER-P0-08.1, the Opportunity Detail route's own
 * action), duplicated here rather than imported across route files (each route
 * directory in this app already keeps its own `actions.ts` wrapping the same underlying
 * module mutations -- `icp/actions.ts` and this file already do the same for their own
 * concerns) so this file's own `revalidatePath` targets the Overview page instead.
 */
export async function sendTopOpportunityToCrmAction(
  businessId: string,
  productId: string,
  opportunityId: string,
  prospectId: string,
  partyId: string,
) {
  try {
    const result = await promoteProspectToCrm(businessId, { partyId, prospectId });
    if (result.ok) {
      await setOpportunityStatus(opportunityId, "sent_to_crm");
      revalidatePath(productPath(businessId, productId));
      revalidatePath(`/dashboard/businesses/${businessId}/products/${productId}/opportunities`);
      revalidatePath(`/dashboard/businesses/${businessId}/products/${productId}/opportunities/${opportunityId}`);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send to CRM.";
    await recordOpportunityHandoffFailure(opportunityId, message);
    revalidatePath(productPath(businessId, productId));
    return { ok: false as const, error: message };
  }
}

/**
 * DISC-OFFER-P1-01.1: "Scheduled Offering Re-Discovery" -- a founder's own choice of
 * cadence. `formData.get("interval")` is trusted only as one of the closed vocabulary's
 * own three values (an unrecognized value falls back to `"off"` rather than the
 * mutation's own DB check constraint being the first thing to reject it).
 */
export async function updateRediscoveryIntervalAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
): Promise<void> {
  const raw = String(formData.get("interval") ?? "off");
  const interval: RediscoveryInterval = raw === "daily" || raw === "weekly" ? raw : "off";
  await setRediscoveryInterval(workspaceId, interval);
  revalidatePath(productPath(businessId, productId));
}

export async function generateProductProfileAction(
  businessId: string,
  productId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const force = formData.get("force") === "true";
    await understandProduct(productId, { force });
    revalidatePath(productPath(businessId, productId));
  });
}
