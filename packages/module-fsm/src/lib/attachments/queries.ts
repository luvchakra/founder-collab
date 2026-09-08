import { cache } from "react";
import { listAttachmentsForEntity, getAttachmentSignedUrl } from "@cofounderai/core/attachments/queries";
import type { JobAttachmentItem } from "./types";

const JOB_ENTITY_TYPE = "job";

/** Photos, videos and PDFs captured in the field (PRD §1.8) -- core's generic
 * attachments store (D-8), scoped to `entity_type='job'` so this list never mixes in a
 * job's own signature images (`entity_type='job_signature'`, `lib/signatures`'s own
 * concern). */
export const listJobAttachments = cache(async (jobId: string): Promise<JobAttachmentItem[]> => {
  const attachments = await listAttachmentsForEntity(JOB_ENTITY_TYPE, jobId);
  return Promise.all(
    attachments.map(async (a) => ({
      id: a.id,
      file_name: a.file_name,
      content_type: a.content_type,
      size_bytes: a.size_bytes,
      created_at: a.created_at,
      url: await getAttachmentSignedUrl(a),
    })),
  );
});
