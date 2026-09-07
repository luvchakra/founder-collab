import { createClient } from "../../db/server";
import {
  getOrCreateConversation,
  markConversationAwaitingReply,
} from "../conversations/mutations";
import { parseTemplateContent } from "./template-content";
import type { Message } from "./types";

/** Editing content resets an approved message back to draft -- it needs re-approval.
 * `subject` is only meaningful for a free-form email; ignored (and left untouched) for a
 * templated one, since Resend applies the template's own subject at send time -- instead,
 * for a templated message, the edited "KEY: value" content lines are re-parsed back into
 * `template_variables`, the values `sendMessage` actually sends. */
export async function updateMessageContent(
  messageId: string,
  content: string,
  subject?: string | null,
): Promise<Message> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Message content is required.");

  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("messages")
    .select("resend_template_id")
    .eq("id", messageId)
    .single();
  if (fetchError) throw fetchError;

  const update = existing.resend_template_id
    ? { content: trimmed, template_variables: parseTemplateContent(trimmed), status: "draft" }
    : { content: trimmed, subject: subject?.trim() || null, status: "draft" };

  const { data, error } = await supabase
    .from("messages")
    .update(update)
    .eq("id", messageId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Lets the founder pick which of the prospect's contacts an outbound email goes to
 * before sending -- sendMessage (lib/messages/send.ts) already resolves the recipient
 * from `contact_id` when it's set, so this is the only piece that was missing. */
export async function updateMessageContact(
  messageId: string,
  contactId: string | null,
): Promise<Message> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ contact_id: contactId })
    .eq("id", messageId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveMessage(messageId: string): Promise<Message> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ status: "approved" })
    .eq("id", messageId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** No send integration yet (blueprint §19) -- this records that the founder sent it
 * themselves after copying the approved content out. Also opens (or re-opens) the
 * conversation thread for this prospect/channel and puts it in "awaiting_reply"
 * (blueprint §21's state machine, Epic 9). */
export async function markMessageSent(messageId: string): Promise<Message> {
  const supabase = await createClient();
  const { data: message, error: fetchError } = await supabase
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .single();
  if (fetchError) throw fetchError;

  const conversation = await getOrCreateConversation(
    message.workspace_id,
    message.prospect_id,
    message.contact_id,
    message.channel,
  );

  const { data, error } = await supabase
    .from("messages")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      conversation_id: conversation.id,
    })
    .eq("id", messageId)
    .select()
    .single();
  if (error) throw error;

  await markConversationAwaitingReply(conversation.id);
  return data;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("messages").delete().eq("id", messageId);
  if (error) throw error;
}
