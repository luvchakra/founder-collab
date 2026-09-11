import { createClient } from "../../db/server";
import type { ClickToChatLink } from "./types";

export async function listClickToChatLinks(businessId: string): Promise<ClickToChatLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("click_to_chat_link").select("*").eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as ClickToChatLink[];
}

/** How many conversations this link has actually attributed so far -- the direct,
 * queryable proof the story's own "can attribute the resulting conversation" acceptance
 * criterion holds, computed live from `crm.interaction.metadata` rather than a
 * maintained counter column (no duplicated master data). */
export async function countAttributedConversations(businessId: string, linkId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("interaction")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .contains("metadata", { clickToChatLinkId: linkId });
  if (error) throw error;
  return count ?? 0;
}
