"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { isValidGstin } from "@cofounderai/core/lib/gst";
import { upsertGstProfile } from "@cofounderai/module-gst/lib/profile/mutations";
import type { GstProfileActionState } from "@cofounderai/module-gst/components/profile/gst-profile-form";

export async function saveGstProfileAction(
  businessId: string,
  _prevState: GstProfileActionState,
  formData: FormData,
): Promise<GstProfileActionState> {
  const gstType = String(formData.get("gst_registration_type") ?? "regular");
  const gstin = String(formData.get("gstin") ?? "").trim().toUpperCase();
  const state = String(formData.get("state") ?? "").trim() || null;

  if (gstType !== "unregistered" && gstin && !isValidGstin(gstin)) {
    return { error: "That GSTIN doesn't look valid — check the 15 characters and try again." };
  }

  try {
    await requirePermission(businessId, "settings.manage");
    await upsertGstProfile(businessId, {
      gstin: gstin || null,
      state,
      gst_registration_type: gstType,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save GST profile." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}/gst/profile`);
  return { success: true };
}
