import { createClient } from "../../db/server";
import type { Conversation, ConversationChannel } from "./types";

export async function getOpenConversation(
  prospectId: string,
  channel: ConversationChannel,
): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("prospect_id", prospectId)
    .eq("channel", channel)
    .neq("status", "closed")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listConversations(prospectId: string): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * DISC-OFFER-P1 §7-04.2 "Offering Portfolio Dashboard" -- the doc's own "Conversations"
 * column, one count per offering. Same batching shape as
 * `getProspectCountsForWorkspaces`/`listOpportunitySummariesForWorkspaces` -- one round
 * trip across every workspace in a business's own offering set, not one query per
 * offering.
 */
export async function getConversationCountsForWorkspaces(workspaceIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (workspaceIds.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase.from("conversations").select("workspace_id").in("workspace_id", workspaceIds);
  if (error) throw error;

  for (const row of data as { workspace_id: string }[]) {
    result[row.workspace_id] = (result[row.workspace_id] ?? 0) + 1;
  }
  return result;
}
