"use server";

import { revalidatePath } from "next/cache";
import { setOpportunityStatus } from "@cofounderai/module-discovery/lib/opportunities/mutations";
import type { OpportunityStatus } from "@cofounderai/module-discovery/lib/opportunities/types";

function opportunityPath(businessId: string, productId: string, opportunityId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/opportunities/${opportunityId}`;
}

/**
 * DISC-OFFER-P0-07.3: the one grouped "Actions" control this detail view owns directly
 * -- a manual status override (`setOpportunityStatus`, 05.1, previously unwired from
 * any live caller). Deliberately does *not* include "Send to CRM" as a status choice
 * here even though it's one of `OpportunityStatus`'s own values: that transition is
 * Epic 08's own "Offering-Aware CRM Handoff" (08.1), which defines the actual payload a
 * real handoff needs to carry -- wiring a bare status flip to it here would let an
 * opportunity claim `sent_to_crm` with none of that context ever having been sent.
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
