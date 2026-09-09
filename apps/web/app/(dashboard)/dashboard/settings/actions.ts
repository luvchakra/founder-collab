"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { disableBusiness, enableBusiness } from "@cofounderai/module-discovery/lib/tenancy/mutations";

export async function disableBusinessAction(
  businessId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await disableBusiness(businessId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not disable this business." };
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function enableBusinessAction(
  businessId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await enableBusiness(businessId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not re-enable this business." };
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: true };
}
