"use server";

import { revalidatePath } from "next/cache";
import { addOpportunityProduct, removeOpportunityProduct } from "@cofounderai/module-crm/lib/opportunities/products";
import {
  addOpportunityContact,
  removeOpportunityContact,
  setPrimaryOpportunityContact,
} from "@cofounderai/module-crm/lib/opportunities/contacts";

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
