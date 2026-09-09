import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import type { UpdateFsmSettingsInput } from "./types";

/** Upserts `fsm.settings` -- the row that doesn't exist for any business yet (F-8/F-9/
 * F-10 each documented "no UI to flip this on until F-15 ships"). `onConflict:
 * 'business_id'` (the table's own primary key) means the very first save for a business
 * creates the row; every save after that updates it in place. */
export async function updateFsmSettings(businessId: string, input: UpdateFsmSettingsInput): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert({ business_id: businessId, ...input }, { onConflict: "business_id" });
  if (error) throw error;
}
