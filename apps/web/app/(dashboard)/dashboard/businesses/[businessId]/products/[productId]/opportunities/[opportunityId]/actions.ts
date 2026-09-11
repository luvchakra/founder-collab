"use server";

import { revalidatePath } from "next/cache";
import { setOpportunityStatus } from "@cofounderai/module-discovery/lib/opportunities/mutations";
import type { OpportunityStatus } from "@cofounderai/module-discovery/lib/opportunities/types";
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
  const result = await promoteProspectToCrm(businessId, { partyId, prospectId });
  if (result.ok) {
    await setOpportunityStatus(opportunityId, "sent_to_crm");
    revalidatePath(opportunityPath(businessId, productId, opportunityId));
    revalidatePath(`/dashboard/businesses/${businessId}/products/${productId}/opportunities`);
  }
  return result;
}
