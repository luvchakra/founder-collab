"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import { saveDimensionSettings } from "@cofounderai/module-gst/lib/dimensions/mutations";
import { DIMENSION_KEYS } from "@cofounderai/module-gst/lib/dimensions/derive";
import type { DimensionSettingsState } from "@cofounderai/module-gst/components/dimensions/dimension-settings-form";

/** FIN-9: saves all four dimension switches and names together. */
export async function saveDimensionSettingsAction(
  businessId: string,
  _prev: DimensionSettingsState,
  formData: FormData,
): Promise<DimensionSettingsState> {
  try {
    await saveDimensionSettings(
      businessId,
      DIMENSION_KEYS.map((key) => ({
        key,
        enabled: formData.get(`enabled_${key}`) === "on",
        label: String(formData.get(`label_${key}`) ?? ""),
      })),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the dimensions." };
  }
  const base = `${await businessPath(businessId)}/finance`;
  revalidatePath(`${base}/dimensions`);
  revalidatePath(`${base}/journal/new`);
  return { success: true };
}
