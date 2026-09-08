import { createClient } from "../db/server";
import type { Message, MessageTemplate, Thread } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/** One thread per entity (S-3) -- `null` when nothing has ever posted to this job/
 * opportunity/ticket yet; callers treat that as "no messages", not an error. */
export async function getThreadForEntity(businessId: string, entityType: string, entityId: string): Promise<Thread | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("business_id", businessId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMessagesForThread(threadId: string): Promise<Message[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listMessageTemplates(businessId: string): Promise<MessageTemplate[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("message_templates").select("*").eq("business_id", businessId).order("name");
  if (error) throw error;
  return data;
}
