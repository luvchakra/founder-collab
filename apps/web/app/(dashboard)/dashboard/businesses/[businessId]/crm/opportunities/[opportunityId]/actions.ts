"use server";

import { revalidatePath } from "next/cache";
import { addOpportunityProduct, removeOpportunityProduct } from "@cofounderai/module-crm/lib/opportunities/products";

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
