"use server";

import { revalidatePath } from "next/cache";
import {
  createPlatformPlan,
  updatePlatformPlan,
  type CreatePlatformPlanInput,
  type UpdatePlatformPlanInput,
} from "@cofounderai/core/admin/platform-plans";

export type PlanFormState =
  | { status: "error"; fieldErrors: Record<string, string>; formError?: string }
  | { status: "success" }
  | null;

/** Reads the fields both the create and edit dialogs share -- everything except `key`,
 * which only the create form submits (a plan's key is immutable after creation, see
 * `updatePlatformPlanSchema`'s own docstring). */
function readCommonFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: String(formData.get("price") ?? "0"),
    billingInterval: String(formData.get("billingInterval") ?? "month") as CreatePlatformPlanInput["billingInterval"],
    currency: String(formData.get("currency") ?? "INR"),
    status: String(formData.get("status") ?? "draft") as CreatePlatformPlanInput["status"],
    displayOrder: String(formData.get("displayOrder") ?? "0"),
    marketingVisible: formData.get("marketingVisible") === "on",
    reason: String(formData.get("reason") ?? ""),
  };
}

export async function createPlanAction(_prevState: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const input: CreatePlatformPlanInput = {
    key: String(formData.get("key") ?? ""),
    ...readCommonFields(formData),
  };

  const result = await createPlatformPlan(input);
  if (!result.ok) return { status: "error", fieldErrors: result.fieldErrors };

  revalidatePath("/platform/plans");
  return { status: "success" };
}

export async function updatePlanAction(id: string, _prevState: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const input: UpdatePlatformPlanInput = readCommonFields(formData);

  const result = await updatePlatformPlan(id, input);
  if (!result.ok) {
    if ("fieldErrors" in result) return { status: "error", fieldErrors: result.fieldErrors };
    return { status: "error", fieldErrors: {}, formError: result.error };
  }

  revalidatePath("/platform/plans");
  return { status: "success" };
}
