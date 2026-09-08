import { createClient } from "../db/server";
import type { Message, MessageChannel, MessageDirection, MessageStatus, Thread } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/** Finds-or-creates the one thread for this entity (S-3) -- idempotent, same "resolve
 * or create lazily" pattern `getOrCreateEstimate`/`getOrCreateInvoiceForJob` already use
 * for their own per-entity documents. */
export async function getOrCreateThread(businessId: string, entityType: string, entityId: string, subject?: string): Promise<Thread> {
  const supabase = await coreClient();
  const { data: existing, error: findError } = await supabase
    .from("threads")
    .select("*")
    .eq("business_id", businessId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("threads")
    .insert({ business_id: businessId, entity_type: entityType, entity_id: entityId, subject: subject?.trim() || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Records one message on a thread -- both directions go through this: an outbound
 * send (staff replying, or a system notification landing in the record) and an inbound
 * reply (a customer's email reply, F-11's own trigger). `createdBy` is left `null` for
 * inbound messages and any other message with no signed-in author. */
export async function postMessage(input: {
  businessId: string;
  threadId: string;
  direction: MessageDirection;
  body: string;
  channel?: MessageChannel;
  fromAddress?: string | null;
  toAddress?: string | null;
  subject?: string | null;
  status?: MessageStatus;
  createdBy?: string | null;
}): Promise<Message> {
  const trimmedBody = input.body.trim();
  if (!trimmedBody) throw new Error("A message body is required.");

  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      business_id: input.businessId,
      thread_id: input.threadId,
      direction: input.direction,
      channel: input.channel ?? "email",
      from_address: input.fromAddress ?? null,
      to_address: input.toAddress ?? null,
      subject: input.subject?.trim() || null,
      body: trimmedBody,
      status: input.status ?? (input.direction === "inbound" ? "received" : "sent"),
      sent_at: input.direction === "outbound" ? new Date().toISOString() : null,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", input.threadId);

  return data;
}

export async function createMessageTemplate(businessId: string, name: string, body: string, subject?: string): Promise<void> {
  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  if (!trimmedName) throw new Error("A name is required.");
  if (!trimmedBody) throw new Error("A body is required.");
  const supabase = await coreClient();
  const { error } = await supabase.from("message_templates").insert({ business_id: businessId, name: trimmedName, subject: subject?.trim() || null, body: trimmedBody });
  if (error) throw error;
}

export async function updateMessageTemplate(id: string, businessId: string, name: string, body: string, subject?: string): Promise<void> {
  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  if (!trimmedName) throw new Error("A name is required.");
  if (!trimmedBody) throw new Error("A body is required.");
  const supabase = await coreClient();
  const { error } = await supabase
    .from("message_templates")
    .update({ name: trimmedName, subject: subject?.trim() || null, body: trimmedBody })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
}

export async function deleteMessageTemplate(id: string, businessId: string): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase.from("message_templates").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}
