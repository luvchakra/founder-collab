"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { updateBusiness } from "@cofounderai/module-discovery/lib/tenancy/mutations";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";

export async function renameBusinessAction(
  businessId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  try {
    await updateBusiness(businessId, { name });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath("/dashboard"); // sidebar and header business selector also show the name
  return { success: true };
}

export async function updateBusinessDescriptionAction(
  businessId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const description = String(formData.get("value") ?? "");

  try {
    await updateBusiness(businessId, { description });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}
