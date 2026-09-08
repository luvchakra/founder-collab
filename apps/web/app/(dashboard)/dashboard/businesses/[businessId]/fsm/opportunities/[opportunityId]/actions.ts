"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { markOpportunityLost, reopenLostOpportunity, updateOpportunity } from "@cofounderai/module-fsm/lib/opportunities/mutations";
import { addWorkTag, removeWorkTag } from "@cofounderai/module-fsm/lib/tags/mutations";
import { setCustomFieldValue } from "@cofounderai/module-fsm/lib/custom-fields/mutations";

const TAGGABLE_TYPE = "opportunity";

function detailPath(businessId: string, opportunityId: string) {
  return `/dashboard/businesses/${businessId}/fsm/opportunities/${opportunityId}`;
}

export async function updateOpportunityAction(
  businessId: string,
  opportunityId: string,
  description: string,
  scopeOfWork: string,
): Promise<void> {
  await requirePermission(businessId, "opportunities.edit");
  await updateOpportunity(opportunityId, businessId, { description, scopeOfWork });
  revalidatePath(detailPath(businessId, opportunityId));
}

export async function markOpportunityLostAction(businessId: string, opportunityId: string, reason: string): Promise<void> {
  await requirePermission(businessId, "opportunities.edit");
  await markOpportunityLost(opportunityId, businessId, reason);
  revalidatePath(detailPath(businessId, opportunityId));
}

export async function reopenOpportunityAction(businessId: string, opportunityId: string): Promise<void> {
  await requirePermission(businessId, "opportunities.edit");
  await reopenLostOpportunity(opportunityId, businessId);
  revalidatePath(detailPath(businessId, opportunityId));
}

export async function addOpportunityTagAction(businessId: string, opportunityId: string, name: string): Promise<void> {
  await requirePermission(businessId, "opportunities.edit");
  await addWorkTag(businessId, TAGGABLE_TYPE, opportunityId, name);
  revalidatePath(detailPath(businessId, opportunityId));
}

export async function removeOpportunityTagAction(businessId: string, opportunityId: string, tagId: string): Promise<void> {
  await requirePermission(businessId, "opportunities.edit");
  await removeWorkTag(businessId, tagId, opportunityId);
  revalidatePath(detailPath(businessId, opportunityId));
}

export async function setOpportunityCustomFieldAction(
  businessId: string,
  opportunityId: string,
  fieldDefId: string,
  value: unknown,
): Promise<void> {
  await requirePermission(businessId, "opportunities.edit");
  await setCustomFieldValue(businessId, fieldDefId, opportunityId, value);
  revalidatePath(detailPath(businessId, opportunityId));
}
