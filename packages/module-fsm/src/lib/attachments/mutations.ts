import { uploadAttachment, deleteAttachment } from "@cofounderai/core/attachments/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";

const JOB_ENTITY_TYPE = "job";

export async function uploadJobAttachment(businessId: string, jobId: string, file: File): Promise<void> {
  await requireModule(businessId, "fsm");
  await uploadAttachment({ businessId, entityType: JOB_ENTITY_TYPE, entityId: jobId, file, fileName: file.name });
}

export { deleteAttachment as deleteJobAttachment };
