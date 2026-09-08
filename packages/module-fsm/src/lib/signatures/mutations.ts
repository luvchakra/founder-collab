import { createClient } from "../../db/server";
import { uploadAttachment } from "@cofounderai/core/attachments/mutations";

/** Captures a signature drawn in the browser: uploads the canvas's own PNG export as a
 * `job_signature`-scoped attachment (core's generic attachments store, D-8 -- no new
 * storage concept needed) and records the `fsm.signatures` row pointing at it. */
export async function captureSignature(businessId: string, jobId: string, signerName: string, image: Blob): Promise<void> {
  const trimmedName = signerName.trim();
  if (!trimmedName) throw new Error("The signer's name is required.");

  const attachment = await uploadAttachment({
    businessId,
    entityType: "job_signature",
    entityId: jobId,
    file: image,
    fileName: `signature-${Date.now()}.png`,
  });

  const supabase = await createClient();
  const { error } = await supabase.from("signatures").insert({
    business_id: businessId,
    job_id: jobId,
    signer_name: trimmedName,
    image_attachment_id: attachment.id,
  });
  if (error) throw error;
}
