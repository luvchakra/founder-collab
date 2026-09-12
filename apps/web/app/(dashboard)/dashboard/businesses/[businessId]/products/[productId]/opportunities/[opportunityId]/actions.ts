"use server";

import { revalidatePath } from "next/cache";
import { setOpportunityStatus, recordOpportunityHandoffFailure, setRecommendedActionOverride } from "@cofounderai/module-discovery/lib/opportunities/mutations";
import type { NextBestAction, OpportunityStatus } from "@cofounderai/module-discovery/lib/opportunities/types";
import { promoteProspectToCrm } from "@cofounderai/module-crm/contract/index";

function opportunityPath(businessId: string, productId: string, opportunityId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/opportunities/${opportunityId}`;
}

/**
 * DISC-OFFER-P0-07.3: the one grouped "Actions" control this detail view owns directly
 * for its own lifecycle -- a manual status override (`setOpportunityStatus`, 05.1,
 * previously unwired from any live caller). Deliberately excludes `sent_to_crm` from
 * its own options -- `sendOpportunityToCrmAction` below is the real transition into
 * that status, not a bare flip.
 */
export async function updateOpportunityStatusAction(
  businessId: string,
  productId: string,
  opportunityId: string,
  formData: FormData,
): Promise<void> {
  const status = String(formData.get("status") ?? "") as OpportunityStatus;
  await setOpportunityStatus(opportunityId, status);
  revalidatePath(opportunityPath(businessId, productId, opportunityId));
  revalidatePath(`/dashboard/businesses/${businessId}/products/${productId}/opportunities`);
}

/**
 * DISC-OFFER-P0-15.1's own "[Edit Recommendation]" -- sets or clears a founder's manual
 * override of the recommended next step, independent of `computeNextBestAction`'s own
 * freely-recomputed guess (`setRecommendedActionOverride`'s own doc comment). An empty
 * `override` value clears back to that computed value rather than being rejected.
 */
export async function updateRecommendedActionAction(
  businessId: string,
  productId: string,
  opportunityId: string,
  formData: FormData,
): Promise<void> {
  const raw = String(formData.get("override") ?? "");
  await setRecommendedActionOverride(opportunityId, raw ? (raw as NextBestAction) : null);
  revalidatePath(opportunityPath(businessId, productId, opportunityId));
  revalidatePath(`/dashboard/businesses/${businessId}/products/${productId}/opportunities`);
  revalidatePath(`/dashboard/businesses/${businessId}/products/${productId}`);
}

/**
 * DISC-OFFER-P0-08.1: "Offering-Aware CRM Handoff." Reuses the existing, already-
 * idempotent `promoteProspectToCrm` (CRM-03.1) unchanged -- no new cross-module payload
 * to carry, since `module-discovery`'s own contract now surfaces this opportunity's
 * score/why-them/why-now/research-brief/recommended-action/discovery-definition
 * *live*, by reference, through `getProspectSummaryForParty` (this same story's other
 * half) -- exactly the same "CRM lead always reflects the latest Discovery data"
 * philosophy `PromoteToCrmButton`'s own dialog copy already states for the
 * prospect-level fields. What this action adds beyond the existing prospect-page
 * button: on success, it also transitions *this specific opportunity* to
 * `sent_to_crm` (07.1/07.3's own recommended-action vocabulary and status picker both
 * left this transition for here, deliberately, rather than a bare status flip with
 * nothing behind it).
 */
export async function sendOpportunityToCrmAction(
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
      revalidatePath(opportunityPath(businessId, productId, opportunityId));
      revalidatePath(`/dashboard/businesses/${businessId}/products/${productId}/opportunities`);
    }
    return result;
  } catch (error) {
    // DISC-OFFER-P0-08.3: "Handoff Failed" -- an unexpected thrown exception (not the
    // ok:false MODULE_NOT_LICENSED/validation results above, which are normal ADR-10
    // outcomes handled by the caller already) is the one case this opportunity didn't
    // previously have a durable record of. Persist it so it survives a reload and shows
    // up as computeHandoffStatus's own "handoff_failed" state, then still resolve with
    // an ok:false result so the button's existing toast path handles the immediate UI
    // feedback the same way it already does for a normal error.
    const message = error instanceof Error ? error.message : "Could not send to CRM.";
    await recordOpportunityHandoffFailure(opportunityId, message);
    revalidatePath(opportunityPath(businessId, productId, opportunityId));
    return { ok: false as const, error: message };
  }
}
