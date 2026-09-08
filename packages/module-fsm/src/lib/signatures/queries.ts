import { cache } from "react";
import { createClient } from "../../db/server";
import { getAttachmentSignedUrl } from "@cofounderai/core/attachments/queries";
import type { Attachment } from "@cofounderai/core/attachments/types";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { SignatureItem } from "./types";

export const listSignaturesForJob = cache(async (businessId: string, jobId: string): Promise<SignatureItem[]> => {
  const supabase = await createClient();
  const { data: signatures, error } = await supabase
    .from("signatures")
    .select("*")
    .eq("business_id", businessId)
    .eq("job_id", jobId)
    .order("signed_at", { ascending: false });
  if (error) throw error;
  if (signatures.length === 0) return [];

  const core = await createCoreClient({ schema: "core" });
  const attachmentIds = signatures.map((s) => s.image_attachment_id).filter((id): id is string => Boolean(id));
  const { data: attachments, error: attachmentsError } = attachmentIds.length
    ? await core.from("attachments").select("*").in("id", attachmentIds)
    : { data: [] as Attachment[], error: null };
  if (attachmentsError) throw attachmentsError;

  const urlByAttachmentId = new Map<string, string>();
  for (const attachment of attachments) {
    urlByAttachmentId.set(attachment.id, await getAttachmentSignedUrl(attachment));
  }

  return signatures.map((s) => ({ ...s, image_url: s.image_attachment_id ? urlByAttachmentId.get(s.image_attachment_id) ?? null : null }));
});
