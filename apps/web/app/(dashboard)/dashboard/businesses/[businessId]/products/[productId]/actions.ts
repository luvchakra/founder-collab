"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addFileKnowledgeSource,
  addKnowledgeSource,
  deleteKnowledgeSource,
  updateKnowledgeSource,
} from "@cofounderai/module-discovery/lib/knowledge/mutations";
import { updateProduct } from "@cofounderai/module-discovery/lib/tenancy/mutations";
import { understandProduct } from "@cofounderai/module-discovery/lib/ai/understand-product";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";

function productPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}`;
}

export async function renameProductAction(
  businessId: string,
  productId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  try {
    await updateProduct(productId, { name });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(productPath(businessId, productId));
  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateProductDescriptionAction(
  businessId: string,
  productId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const description = String(formData.get("value") ?? "");

  try {
    await updateProduct(productId, { description });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(productPath(businessId, productId));
  return { success: true };
}

export async function updateProductWebsiteAction(
  businessId: string,
  productId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const website = String(formData.get("value") ?? "");

  try {
    await updateProduct(productId, { website });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(productPath(businessId, productId));
  return { success: true };
}

export async function addFileSourceAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw new Error("Choose at least one file to upload.");
  }
  // Sequential, not Promise.all -- each upload also mints its own storage path from
  // Date.now() (addFileKnowledgeSource's own dedup key), and concurrent calls in the
  // same tick could collide on that timestamp.
  for (const file of files) {
    await addFileKnowledgeSource(workspaceId, file);
  }
  revalidatePath(productPath(businessId, productId));
}

export async function addTextSourceAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const content = String(formData.get("content") ?? "");
  const sourceName = String(formData.get("sourceName") ?? "");
  await addKnowledgeSource(workspaceId, { sourceType: "manual", sourceName, content });
  revalidatePath(productPath(businessId, productId));
}

export async function deleteSourceAction(
  businessId: string,
  productId: string,
  sourceId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteKnowledgeSource(sourceId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not delete this source." };
  }
  revalidatePath(productPath(businessId, productId));
  return { success: true };
}

export async function updateSourceAction(
  businessId: string,
  productId: string,
  sourceId: string,
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const content = String(formData.get("value") ?? "");

  try {
    await updateKnowledgeSource(sourceId, content);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(productPath(businessId, productId));
  return { success: true };
}

export async function generateProductProfileAction(
  businessId: string,
  productId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const force = formData.get("force") === "true";
    await understandProduct(productId, { force });
    revalidatePath(productPath(businessId, productId));
  });
}
