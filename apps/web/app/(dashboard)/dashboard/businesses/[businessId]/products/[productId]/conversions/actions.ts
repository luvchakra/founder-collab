"use server";

import { revalidatePath } from "next/cache";
import { createOpportunityFromWonProspect } from "@cofounderai/module-fsm/contract/index";

function conversionsPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/conversions`;
}

/**
 * The Conversions page's manual "Create opportunity" button -- see
 * `module-fsm/src/contract/index.ts#createOpportunityFromWonProspect`'s own docstring
 * for why this exists alongside the automatic `prospect.won` event handoff. Returns the
 * contract's own result rather than throwing, so the page can distinguish
 * `MODULE_NOT_LICENSED` (show the purchase prompt) from a genuine failure (show the
 * error) -- same ADR-10 pattern every other cross-module contract caller follows.
 */
export async function createOpportunityAction(
  businessId: string,
  productId: string,
  input: { prospectId: string; partyId: string; companyName: string; description?: string | null; workspaceId?: string | null },
) {
  const result = await createOpportunityFromWonProspect(businessId, input);
  if (result.ok) revalidatePath(conversionsPath(businessId, productId));
  return result;
}
