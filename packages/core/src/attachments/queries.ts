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

/** The `attachments` bucket is private (D-8's own migration) -- a plain `getPublicUrl`
 * would return a URL that 404s. `createSignedUrl` itself is RLS-checked at generation
 * time (the same "member of this business" policy that gates the object's own read),
 * so a caller who can already list this attachment can always mint one. One hour is
 * enough for a page render plus a deliberate re-open; this is a preview/download link,
 * not a durable reference -- nothing should persist it. */
export async function getAttachmentSignedUrl(attachment: Attachment, expiresInSeconds = 3600): Promise<string> {
  const supabase = await coreClient();
  const { data, error } = await supabase.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
