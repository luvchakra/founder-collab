"use server";

import { revalidatePath } from "next/cache";
import { setOpportunityStatus } from "@cofounderai/module-discovery/lib/opportunities/mutations";
import type { OpportunityStatus } from "@cofounderai/module-discovery/lib/opportunities/types";
import { researchProspect } from "@cofounderai/module-discovery/lib/ai/research-prospect";
import { applyIncrementalSignalUpdate } from "@cofounderai/module-discovery/lib/pipeline/incremental";
import { getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";

type ActionResult = { error: string } | { success: true };

function opportunitiesPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/opportunities`;
}

/**
 * DISC-OFFER-P1-05.3: "Editable Stage Rows" -- the doc's own "Watch"/"Exclude" row
 * menu items, both a plain `setOpportunityStatus` call already used by the Opportunity
 * Detail page's own status form -- this is the same edit, reachable from the list
 * without a detour through that page ("do not force users through a separate detail
 * screen for simple row edits").
 */
export async function setOpportunityStatusFromListAction(
  businessId: string,
  productId: string,
  opportunityId: string,
  status: OpportunityStatus,
): Promise<ActionResult> {
  try {
    await setOpportunityStatus(opportunityId, status);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update this opportunity." };
  }
  revalidatePath(opportunitiesPath(businessId, productId));
  return { success: true };
}

/**
 * DISC-OFFER-P1-05.3's own "Research Again" row menu item -- the exact same
 * research-then-incrementally-update sequence `researchProspectAction`
 * (prospects/[prospectId]/actions.ts) already runs, adapted to this route's own
 * `{error}|{success:true}` result shape (`researchProspectAction`'s own `AiActionState`
 * is built for `AiActionForm`, not a dropdown-menu action) rather than reusing that
 * function directly. Same "never let the follow-on incremental recompute's own failure
 * mask the research success" isolation DISC-OFFER-P1-01.2 already established.
 */
export async function researchAgainFromListAction(
  businessId: string,
  productId: string,
  prospectId: string,
): Promise<ActionResult> {
  try {
    await researchProspect(prospectId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not research this prospect." };
  }
  try {
    const workspace = await getWorkspaceForProduct(productId);
    if (workspace) await applyIncrementalSignalUpdate(workspace.id, prospectId);
  } catch {
    // Fresh research is already saved and worth showing regardless.
  }
  revalidatePath(opportunitiesPath(businessId, productId));
  return { success: true };
}
