import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { DIMENSION_KEYS, type DimensionKey } from "./derive";

export interface DimensionSettingInput {
  key: DimensionKey;
  enabled: boolean;
  label: string | null;
}

/** FIN-9: saves all four dimensions in one upsert — the settings form shows them together
 * and they are saved together. Switching one off keeps its label for when it comes back. */
export async function saveDimensionSettings(businessId: string, settings: DimensionSettingInput[]): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.dimensions.manage");

  const rows = settings
    .filter((s) => DIMENSION_KEYS.includes(s.key))
    .map((s) => {
      const label = s.label?.trim() ?? "";
      if (label.length > 40) throw new Error("Keep each dimension's name to 40 characters.");
      return { business_id: businessId, dimension_key: s.key, enabled: s.enabled, label: label || null };
    });

  const supabase = await createClient();
  const { error } = await supabase.from("dimension_settings").upsert(rows, { onConflict: "business_id,dimension_key" });
  if (error) throw error;
}
