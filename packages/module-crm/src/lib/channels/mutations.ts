import { createClient } from "../../db/server";
import type { ChannelKind } from "./types";

/** S-1's own skeleton scope: create + toggle only, no edit-in-place or delete -- the
 * real unified-inbox feature (message ingestion per channel, etc.) is a later story. */
export async function createChannel(businessId: string, kind: ChannelKind, name: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("channels").insert({ business_id: businessId, kind, name });
  if (error) throw error;
}

export async function setChannelActive(channelId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("channels").update({ is_active: isActive }).eq("id", channelId);
  if (error) throw error;
}
