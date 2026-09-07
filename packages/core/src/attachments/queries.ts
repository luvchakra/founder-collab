import { createClient } from "../db/server";
import type { Attachment } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function listAttachmentsForEntity(entityType: string, entityId: string): Promise<Attachment[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
