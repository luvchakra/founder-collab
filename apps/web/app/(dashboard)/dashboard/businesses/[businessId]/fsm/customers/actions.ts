"use server";

import { revalidatePath } from "next/cache";
import { updateFsmCustomer } from "@cofounderai/module-fsm/lib/customers/mutations";

export async function updateFsmCustomerAction(
  businessId: string,
  partyId: string,
  patch: { name?: string; email?: string | null; phone?: string | null },
): Promise<{ error: string } | void> {
  try {
    await updateFsmCustomer(businessId, partyId, patch);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}/fsm/customers`);
}
