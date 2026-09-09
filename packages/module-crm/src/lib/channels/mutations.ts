import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import type { ChannelKind } from "./types";

/** S-1's own skeleton scope: create + toggle only, no edit-in-place or delete -- the
 * real unified-inbox feature (message ingestion per channel, etc.) is a later story. */
export async function createChannel(businessId: string, kind: ChannelKind, name: string): Promise<void> {
  await requireModule(businessId, "crm");
  const supabase = await createClient();
  const { error } = await supabase.from("channels").insert({ business_id: businessId, kind, name });
  if (error) throw error;
}

/** See `tickets/mutations.ts#updateTicketStatus`'s own doc comment for why this checks
 * the row actually came back instead of trusting a plain `.update()` with no `.select()`
 * -- RLS silently excludes non-matching rows from an UPDATE rather than erroring. */
export async function setChannelActive(channelId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("channels").update({ is_active: isActive }).eq("id", channelId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This channel could not be updated -- it may have been removed, or your access to it may have changed.");
  }
}
