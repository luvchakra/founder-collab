"use server";

import { revalidatePath } from "next/cache";
import { addOpportunityProduct, removeOpportunityProduct } from "@cofounderai/module-crm/lib/opportunities/products";
import {
  addOpportunityContact,
  removeOpportunityContact,
  setPrimaryOpportunityContact,
} from "@cofounderai/module-crm/lib/opportunities/contacts";
import { setOpportunityNextAction, createFsmQuoteForOpportunity, createJobFromFsmQuote } from "@cofounderai/module-crm/lib/opportunities/mutations";
import { setFulfillmentRequirement } from "@cofounderai/module-crm/lib/opportunities/fulfillment";
import type { FulfillmentRequirement } from "@cofounderai/module-crm/lib/opportunities/types";
import { completeActivity, createActivity } from "@cofounderai/module-crm/lib/activities/mutations";
import type { ActivityType } from "@cofounderai/module-crm/lib/activities/types";
import { completeFollowUp, createFollowUp } from "@cofounderai/module-crm/lib/follow-ups/mutations";
import type { FollowUpPriority } from "@cofounderai/module-crm/lib/follow-ups/types";

function opportunityPath(businessId: string, opportunityId: string) {
  return `/dashboard/businesses/${businessId}/crm/opportunities/${opportunityId}`;
}

/** CRM-04.4's add-product form action. */
export async function addOpportunityProductAction(businessId: string, opportunityId: string, formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") || "");
  if (!itemId) return;
  const rawQuantity = formData.get("quantity");
  await addOpportunityProduct(businessId, opportunityId, itemId, rawQuantity ? Number(rawQuantity) : null);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

export async function removeOpportunityProductAction(businessId: string, opportunityId: string, productInterestId: string): Promise<void> {
  await removeOpportunityProduct(businessId, opportunityId, productInterestId);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

/** CRM-04.5's add-contact form action. */
export async function addOpportunityContactAction(businessId: string, opportunityId: string, formData: FormData): Promise<void> {
  const partyContactId = String(formData.get("partyContactId") || "");
  if (!partyContactId) return;
  await addOpportunityContact(businessId, opportunityId, partyContactId);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

export async function removeOpportunityContactAction(businessId: string, opportunityId: string, opportunityContactId: string): Promise<void> {
  await removeOpportunityContact(businessId, opportunityId, opportunityContactId);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

export async function setPrimaryOpportunityContactAction(businessId: string, opportunityId: string, opportunityContactId: string): Promise<void> {
  await setPrimaryOpportunityContact(businessId, opportunityId, opportunityContactId);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

/** CRM-05.2's add-next-action form action: creates the activity, then designates it. */
export async function createOpportunityNextActionAction(businessId: string, opportunityId: string, formData: FormData): Promise<void> {
  const type = String(formData.get("type") || "task") as ActivityType;
  const subject = String(formData.get("subject") || "") || null;
  const dueAt = String(formData.get("dueAt") || "") || null;
  const ownerId = String(formData.get("ownerId") || "") || null;
  const activity = await createActivity(businessId, { type, subject, opportunityId, dueAt, ownerId });
  await setOpportunityNextAction(businessId, opportunityId, activity.id);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

/** CRM-05.2's "completing an action can prompt creation of the next action" -- clearing
 * next_action_id here is what makes the add-next-action form reappear right where the
 * completed one was, once the page revalidates. */
export async function completeOpportunityNextActionAction(businessId: string, opportunityId: string, activityId: string): Promise<void> {
  await completeActivity(businessId, activityId);
  await setOpportunityNextAction(businessId, opportunityId, null);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

/** CRM-05.3's add-follow-up form action, scoped to this opportunity. */
export async function createOpportunityFollowUpAction(businessId: string, opportunityId: string, formData: FormData): Promise<void> {
  const dueAt = String(formData.get("dueAt") || "");
  if (!dueAt) return;
  const priority = String(formData.get("priority") || "normal") as FollowUpPriority;
  const ownerId = String(formData.get("ownerId") || "") || null;
  await createFollowUp(businessId, { opportunityId, dueAt, priority, ownerId });
  revalidatePath(opportunityPath(businessId, opportunityId));
}

export async function completeOpportunityFollowUpAction(businessId: string, opportunityId: string, followUpId: string): Promise<void> {
  await completeFollowUp(businessId, followUpId);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

/** CRM-11.1's "Create FSM Quote from Opportunity" button. */
export async function createFsmQuoteAction(businessId: string, opportunityId: string): Promise<void> {
  await createFsmQuoteForOpportunity(businessId, opportunityId);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

/** CRM-11.3's "Accepted Quote -> Job" button ("User action: Create Job in FSM"). */
export async function createFsmJobAction(businessId: string, opportunityId: string): Promise<void> {
  await createJobFromFsmQuote(businessId, opportunityId);
  revalidatePath(opportunityPath(businessId, opportunityId));
}

/** INT-02.1's fulfillment-gate form action -- the human's explicit confirm/override of
 * the suggested default. */
export async function setFulfillmentRequirementAction(businessId: string, opportunityId: string, formData: FormData): Promise<void> {
  const value = String(formData.get("fulfillmentRequirement") || "") as FulfillmentRequirement;
  if (!value) return;
  await setFulfillmentRequirement(businessId, opportunityId, value);
  revalidatePath(opportunityPath(businessId, opportunityId));
}
