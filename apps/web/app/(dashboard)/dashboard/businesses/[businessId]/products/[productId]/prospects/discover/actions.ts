"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { discoverProspects } from "@cofounderai/module-discovery/lib/ai/discover-prospects";
import {
  approveProspectSuggestions,
  discardProspectSuggestions,
} from "@cofounderai/module-discovery/lib/prospects/mutations";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";

function discoverPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/prospects/discover`;
}
function prospectsPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/prospects`;
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
    revalidatePath(discoverPath(businessId, productId));
    redirect(discoverPath(businessId, productId));
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
  revalidatePath(prospectsPath(businessId, productId));
  revalidatePath(discoverPath(businessId, productId));
  redirect(`${prospectsPath(businessId, productId)}?imported=${added}`);
}

export async function discardSuggestionsAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  await discardProspectSuggestions(workspaceId, ids);
  revalidatePath(discoverPath(businessId, productId));
  redirect(discoverPath(businessId, productId));
}
