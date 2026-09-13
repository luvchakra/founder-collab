"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { discoverProspects } from "@cofounderai/module-discovery/lib/ai/discover-prospects";
import {
  approveProspectSuggestions,
  discardProspectSuggestions,
} from "@cofounderai/module-discovery/lib/prospects/mutations";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";

async function discoverPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/products/${productId}/prospects/discover`;
}
async function prospectsPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/products/${productId}/prospects`;
}

export async function runDiscoveryAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  const filters = {
    industry: String(formData.get("industry") ?? "").trim() || undefined,
    companySize: String(formData.get("companySize") ?? "").trim() || undefined,
    location: String(formData.get("location") ?? "").trim() || undefined,
    keywords: String(formData.get("keywords") ?? "").trim() || undefined,
  };

  return runAiAction(async () => {
    await discoverProspects(workspaceId, filters);
    revalidatePath(await discoverPath(businessId, productId));
    redirect(await discoverPath(businessId, productId));
  });
}

export async function approveSuggestionsAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  const added = await approveProspectSuggestions(workspaceId, ids);
  revalidatePath(await prospectsPath(businessId, productId));
  revalidatePath(await discoverPath(businessId, productId));
  redirect(`${await prospectsPath(businessId, productId)}?imported=${added}`);
}

export async function discardSuggestionsAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  await discardProspectSuggestions(workspaceId, ids);
  revalidatePath(await discoverPath(businessId, productId));
  redirect(await discoverPath(businessId, productId));
}
