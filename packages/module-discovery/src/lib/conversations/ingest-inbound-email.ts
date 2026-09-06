import { createAdminClient } from "../../db/admin";
import { classifyReply } from "../ai/classify-reply";
import type { Message } from "../messages/types";

export type InboundEmailPayload = {
  from: string;
  subject?: string | null;
  text: string;
};

export type IngestResult =
  | { matched: true; message: Message }
  | { matched: false; reason: string };

/**
 * Matches an inbound email reply to a contact by "from" address, then appends it to that
 * contact's open (or newly opened) email conversation. There's no automated send
 * integration (lib/messages/mutations.ts) and so no Message-ID/In-Reply-To we control to
 * thread on -- the contact's email address is the only signal available, which is
 * sufficient since a contact has at most one open (non-closed) email conversation at a
 * time.
 *
 * Runs with the admin client (no logged-in user in a webhook request) and does its own
 * tenant resolution via the contact lookup, per lib/supabase/admin.ts's contract.
 */
export async function ingestInboundEmail(payload: InboundEmailPayload): Promise<IngestResult> {
  const fromEmail = payload.from.trim().toLowerCase();
  if (!fromEmail) return { matched: false, reason: "Missing sender address." };

  const admin = createAdminClient();

  const { data: contact, error: contactError } = await admin
    .from("contacts")
    .select("id, workspace_id, prospect_id")
    .ilike("email", fromEmail)
    .limit(1)
    .maybeSingle();
  if (contactError) throw contactError;
  if (!contact) return { matched: false, reason: `No contact found for ${fromEmail}.` };

  const { data: existingConversation, error: findError } = await admin
    .from("conversations")
    .select("*")
    .eq("prospect_id", contact.prospect_id)
    .eq("channel", "email")
    .neq("status", "closed")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  let conversation = existingConversation;
  if (!conversation) {
    const { data, error } = await admin
      .from("conversations")
      .insert({
        workspace_id: contact.workspace_id,
        prospect_id: contact.prospect_id,
        contact_id: contact.id,
        channel: "email",
      })
      .select()
      .single();
    if (error) throw error;
    conversation = data;
  }

  const content = payload.subject
    ? `Subject: ${payload.subject}\n\n${payload.text}`
    : payload.text;

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      workspace_id: contact.workspace_id,
      prospect_id: contact.prospect_id,
      contact_id: contact.id,
      conversation_id: conversation.id,
      channel: "email",
      direction: "inbound",
      content,
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (insertError) throw insertError;

  const { error: updateError } = await admin
    .from("conversations")
    .update({ status: "replied", last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);
  if (updateError) throw updateError;

  // Best-effort -- an ingested reply is worth keeping even if classification fails (rate
  // limit, model error). The founder can still read it, just without the AI's suggested
  // next step.
  try {
    const classified = await classifyReply(message.id);
    return { matched: true, message: classified };
  } catch (error) {
    console.error("Failed to classify inbound reply:", error);
    return { matched: true, message };
  }
}
