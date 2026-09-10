"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { markOpportunityLost, reopenLostOpportunity, updateOpportunity } from "@cofounderai/module-fsm/lib/opportunities/mutations";
import { getOpportunity } from "@cofounderai/module-fsm/lib/opportunities/queries";
import { addWorkTag, removeWorkTag } from "@cofounderai/module-fsm/lib/tags/mutations";
import { setCustomFieldValue } from "@cofounderai/module-fsm/lib/custom-fields/mutations";
import {
  addChargeLine,
  approveEstimateInternal,
  declineEstimateInternal,
  deleteChargeLine,
  getOrCreateEstimate,
  reorderChargeLines,
  sendEstimate,
  updateChargeLine,
} from "@cofounderai/module-fsm/lib/estimates/mutations";
import type { AddChargeLineInput, UpdateChargeLineInput } from "@cofounderai/module-fsm/lib/estimates/types";

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

/** Lazily creates the opportunity's draft estimate document the first time a charge is
 * added -- there's nothing to show on the detail page until then. */
export async function addEstimateChargeLineAction(businessId: string, opportunityId: string, input: AddChargeLineInput): Promise<void> {
  await requirePermission(businessId, "estimates.edit");
  const opportunity = await getOpportunity(businessId, opportunityId);
  if (!opportunity) throw new Error("Opportunity not found.");
  const estimateId = await getOrCreateEstimate(businessId, opportunity);
  await addChargeLine(businessId, estimateId, input);
  revalidatePath(detailPath(businessId, opportunityId));
}

export async function updateEstimateChargeLineAction(
  businessId: string,
  estimateId: string,
  opportunityId: string,
  lineId: string,
  patch: UpdateChargeLineInput,
): Promise<void> {
  await requirePermission(businessId, "estimates.edit");
  await updateChargeLine(businessId, estimateId, lineId, patch);
  revalidatePath(detailPath(businessId, opportunityId));
}

export async function deleteEstimateChargeLineAction(
  businessId: string,
  estimateId: string,
  opportunityId: string,
  lineId: string,
): Promise<void> {
  await requirePermission(businessId, "estimates.edit");
  await deleteChargeLine(businessId, estimateId, lineId);
  revalidatePath(detailPath(businessId, opportunityId));
}

export async function reorderEstimateChargeLinesAction(
  businessId: string,
  estimateId: string,
  opportunityId: string,
  orderedLineIds: string[],
): Promise<void> {
  await requirePermission(businessId, "estimates.edit");
  await reorderChargeLines(estimateId, orderedLineIds);
  revalidatePath(detailPath(businessId, opportunityId));
}

/**
 * These three return `{ error }` instead of throwing on a failed mutation -- Next.js 16's
 * own guidance (node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md
 * "Handling expected errors": "avoid using try/catch blocks and throw errors. Instead,
 * model expected errors as return values"). A thrown Error here reaches the browser as a
 * generic, redacted "Minified React error #441... Server Components render" message with
 * no useful text -- confirmed live via Vercel runtime error logs: the real thrown error
 * ("No email on file for this customer...") logs its full message server-side, but the
 * client only ever saw the digest-redacted placeholder. estimate-builder.tsx's `run()`
 * checks for a returned `{ error }` now, same as it already checked a thrown one.
 */
export async function sendEstimateAction(businessId: string, opportunityId: string, estimateId: string): Promise<{ error: string } | void> {
  await requirePermission(businessId, "estimates.edit");
  try {
    await sendEstimate(businessId, opportunityId, estimateId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath(detailPath(businessId, opportunityId));
}

/** Staff-side "approve internally" (F-4 -- PRD §2 Estimates row MUST list): same effect
 * as a customer approving on the public page, without requiring the customer to click
 * through it. */
export async function approveEstimateInternalAction(businessId: string, opportunityId: string, estimateId: string): Promise<{ error: string } | void> {
  await requirePermission(businessId, "estimates.edit");
  try {
    await approveEstimateInternal(businessId, opportunityId, estimateId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath(detailPath(businessId, opportunityId));
}

export async function declineEstimateInternalAction(businessId: string, opportunityId: string, estimateId: string): Promise<{ error: string } | void> {
  await requirePermission(businessId, "estimates.edit");
  try {
    await declineEstimateInternal(businessId, opportunityId, estimateId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath(detailPath(businessId, opportunityId));
}
