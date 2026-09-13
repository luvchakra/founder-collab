"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { generateApiKey, revokeApiKey } from "@cofounderai/core/api-v1/keys/mutations";

export async function generateApiKeyAction(
  businessId: string,
  name: string,
): Promise<{ id: string; rawKey: string }> {
  const result = await generateApiKey(businessId, name);
  revalidatePath(`${await businessPath(businessId)}/admin/api-keys`);
  return result;
}

export async function revokeApiKeyAction(businessId: string, id: string): Promise<void> {
  await revokeApiKey(id);
  revalidatePath(`${await businessPath(businessId)}/admin/api-keys`);
}
