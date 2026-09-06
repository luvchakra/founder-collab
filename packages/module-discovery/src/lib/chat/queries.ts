import { createClient } from "../../db/server";
import type { ChatMessage } from "../ai/chat";

export type PersistedChatMessage = ChatMessage & { followUp: string | null };

/** Caps how many persisted turns a page load ever has to fetch/render -- without this, a
 * long-running conversation would make every chat-panel open slower forever, fetching
 * the *entire* history just to show (and, per MAX_HISTORY_MESSAGES in lib/ai/chat.ts,
 * immediately truncate for) the most recent turns anyway. */
const MAX_LOADED_MESSAGES = 50;

/** Most recent conversation for a workspace, oldest first -- see
 * supabase/migrations/20260906070000_chat_messages_schema.sql. Append-only: nothing in
 * the app deletes or edits a row here. */
export async function listChatMessages(workspaceId: string): Promise<PersistedChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, follow_up")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(MAX_LOADED_MESSAGES);
  if (error) throw error;

  return data.reverse().map((row) => ({
    role: row.role as ChatMessage["role"],
    content: row.content,
    followUp: row.follow_up,
  }));
}

export async function appendChatMessage(
  workspaceId: string,
  message: { role: ChatMessage["role"]; content: string; followUp?: string | null },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("chat_messages").insert({
    workspace_id: workspaceId,
    role: message.role,
    content: message.content,
    follow_up: message.followUp ?? null,
  });
  if (error) throw error;
}
