import { createClient } from "../db/server";
import type { Attachment } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/** Uploads to the `attachments` Storage bucket at
 * `<businessId>/<a fresh id>/<fileName>` (the bucket's own RLS policies key off that
 * first path segment being one of the caller's businesses -- D-8), then records the
 * metadata row. The `.storage` API isn't schema-scoped, so the same client instance
 * used for the `core.attachments` insert works for the upload too. */
export async function uploadAttachment(input: {
  businessId: string;
  entityType: string;
  entityId: string;
  file: Blob;
  fileName: string;
}): Promise<Attachment> {
  const supabase = await coreClient();
  const attachmentId = crypto.randomUUID();
  const storagePath = `${input.businessId}/${attachmentId}/${input.fileName}`;

  const { error: uploadError } = await supabase.storage.from("attachments").upload(storagePath, input.file, {
    contentType: input.file.type || undefined,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      id: attachmentId,
      business_id: input.businessId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      storage_path: storagePath,
      file_name: input.fileName,
      content_type: input.file.type || null,
      size_bytes: input.file.size,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const supabase = await coreClient();
  const { data: attachment, error: fetchError } = await supabase
    .from("attachments")
    .select("storage_bucket, storage_path")
    .eq("id", attachmentId)
    .single();
  if (fetchError) throw fetchError;

  const { error: storageError } = await supabase.storage
    .from(attachment.storage_bucket)
    .remove([attachment.storage_path]);
  if (storageError) throw storageError;

  const { error } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (error) throw error;
}
