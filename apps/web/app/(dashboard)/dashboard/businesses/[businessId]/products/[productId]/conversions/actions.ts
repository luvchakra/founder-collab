"use server";

import { revalidatePath } from "next/cache";
import { createOpportunityFromWonProspect } from "@cofounderai/module-fsm/contract/index";
import { getProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";

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
 *
 * Resolves this product's own `linked_item_id` (item #1 of a cross-module UX pass) and
 * passes it through so the contract call can pre-seed the new estimate with a charge
 * line for it (item #3) -- resolved here rather than trusted from the caller, since this
 * action already has `productId` in scope and there's no reason to ask the client for
 * data the server can look up itself.
 */
export async function createOpportunityAction(
  businessId: string,
  productId: string,
  input: { prospectId: string; partyId: string; companyName: string; description?: string | null; workspaceId?: string | null },
) {
  const product = await getProduct(productId);
  const result = await createOpportunityFromWonProspect(businessId, { ...input, itemId: product?.linked_item_id ?? null });
  if (result.ok) revalidatePath(conversionsPath(businessId, productId));
  return result;
}
