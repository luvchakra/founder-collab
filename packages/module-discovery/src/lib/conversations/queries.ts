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
