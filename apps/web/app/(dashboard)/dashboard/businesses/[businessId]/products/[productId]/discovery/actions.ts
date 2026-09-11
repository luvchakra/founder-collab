"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  createDiscoveryDefinition,
  updateDiscoveryDefinition,
  setDiscoveryDefinitionEnabled,
  deleteDiscoveryDefinition,
  parseListField,
} from "@cofounderai/module-discovery/lib/discovery-definitions/mutations";
import type { MonitoringFrequency } from "@cofounderai/module-discovery/lib/discovery-definitions/types";

type ActionResult = { error: string } | { success: true };

function discoveryPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/discovery`;
}

function definitionFieldsFromFormData(formData: FormData) {
  const rawScore = String(formData.get("minimumScore") ?? "").trim();
  return {
    name: String(formData.get("name") ?? ""),
    targetGeographies: parseListField(String(formData.get("targetGeographies") ?? "")),
    targetIndustries: parseListField(String(formData.get("targetIndustries") ?? "")),
    buyerRoles: parseListField(String(formData.get("buyerRoles") ?? "")),
    desiredSignals: parseListField(String(formData.get("desiredSignals") ?? "")),
    excludedSignals: parseListField(String(formData.get("excludedSignals") ?? "")),
    disqualifiers: parseListField(String(formData.get("disqualifiers") ?? "")),
    minimumScore: rawScore ? Number(rawScore) : null,
    monitoringFrequency: String(formData.get("monitoringFrequency") ?? "weekly") as MonitoringFrequency,
  };
}

export async function createDefinitionAction(businessId: string, productId: string, formData: FormData): Promise<ActionResult> {
  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) return { error: "Workspace not found for this offering." };

  try {
    await createDiscoveryDefinition(workspace.id, definitionFieldsFromFormData(formData));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create this discovery definition." };
  }
  revalidatePath(discoveryPath(businessId, productId));
  return { success: true };
}

export async function updateDefinitionAction(businessId: string, productId: string, definitionId: string, formData: FormData): Promise<ActionResult> {
  try {
    await updateDiscoveryDefinition(definitionId, definitionFieldsFromFormData(formData));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save this discovery definition." };
  }
  revalidatePath(discoveryPath(businessId, productId));
  return { success: true };
}

export async function setDefinitionEnabledAction(businessId: string, productId: string, definitionId: string, isEnabled: boolean): Promise<ActionResult> {
  try {
    await setDiscoveryDefinitionEnabled(definitionId, isEnabled);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update this discovery definition." };
  }
  revalidatePath(discoveryPath(businessId, productId));
  return { success: true };
}

export async function deleteDefinitionAction(businessId: string, productId: string, definitionId: string): Promise<ActionResult> {
  try {
    await deleteDiscoveryDefinition(definitionId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not delete this discovery definition." };
  }
  revalidatePath(discoveryPath(businessId, productId));
  return { success: true };
}
