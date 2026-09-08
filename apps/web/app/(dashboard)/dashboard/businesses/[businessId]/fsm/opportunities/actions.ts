"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createOpportunity } from "@cofounderai/module-fsm/lib/opportunities/mutations";
import type { CreateOpportunityActionState } from "@cofounderai/module-fsm/components/opportunities/create-opportunity-dialog";

function opportunitiesPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/fsm/opportunities`;
}

export async function createOpportunityAction(
  businessId: string,
  _prevState: CreateOpportunityActionState,
  formData: FormData,
): Promise<CreateOpportunityActionState> {
  try {
    await requirePermission(businessId, "opportunities.edit");

    const partyId = String(formData.get("party_id") ?? "").trim();
    const newCustomerName = String(formData.get("new_customer_name") ?? "").trim();

    const id = await createOpportunity(businessId, {
      partyId: partyId || undefined,
      newCustomer: newCustomerName
        ? {
            name: newCustomerName,
            email: String(formData.get("new_customer_email") ?? "").trim() || undefined,
            phone: String(formData.get("new_customer_phone") ?? "").trim() || undefined,
          }
        : undefined,
      serviceTypeId: String(formData.get("service_type_id") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim(),
      scopeOfWork: String(formData.get("scope_of_work") ?? "").trim(),
    });

    revalidatePath(opportunitiesPath(businessId));
    return { success: true, id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create opportunity." };
  }
}
