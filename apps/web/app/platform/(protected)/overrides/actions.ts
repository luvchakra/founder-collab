"use server";

import { revalidatePath } from "next/cache";
import {
  createBusinessOverride,
  revokeBusinessOverride,
  type CreateBusinessOverrideInput,
} from "@cofounderai/core/admin/platform-business-overrides";

// PLATFORM-P1-02.1/02.2/02.3: thin wrappers; authorization (superadmin), validation and the
// audit trail live in core and the database.
export async function createOverrideAction(input: CreateBusinessOverrideInput) {
  const result = await createBusinessOverride(input);
  if (result.ok) {
    revalidatePath("/platform/overrides");
    revalidatePath("/platform/audit");
  }
  return result;
}

export async function revokeOverrideAction(id: string, reason: string) {
  const result = await revokeBusinessOverride(id, reason);
  if (result.ok) {
    revalidatePath("/platform/overrides");
    revalidatePath("/platform/audit");
  }
  return result;
}
