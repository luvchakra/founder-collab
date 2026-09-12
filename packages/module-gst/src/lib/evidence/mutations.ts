import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { uploadAttachment } from "@cofounderai/core/attachments/mutations";
import { createClient } from "../../db/server";
import { getComplianceEvidenceById } from "./queries";
import type { ComplianceEvidenceWithAttachment, EvidenceType, RelatedEntityType } from "./types";

export type RecordComplianceEvidenceInput = {
  file: Blob;
  fileName: string;
  evidenceType: EvidenceType;
  description?: string;
  relatedEntityType?: RelatedEntityType;
  relatedEntityId?: string;
};

/** Pure: `relatedEntityType`/`relatedEntityId` must be supplied together, or not at all
 * -- matching the migration's own `compliance_evidence_related_entity_both_or_neither`
 * check constraint, checked here too so a caller gets a clear message before an upload
 * even starts, not an opaque database error after the file is already stored. */
export function validateRelatedEntityPair(relatedEntityType: RelatedEntityType | undefined, relatedEntityId: string | undefined): string | null {
  if ((relatedEntityType === undefined) !== (relatedEntityId === undefined)) {
    return "relatedEntityType and relatedEntityId must be provided together, or not at all.";
  }
  return null;
}

/**
 * COMPLY-P0-10.1 (Evidence Repository): uploads the underlying file via
 * `@cofounderai/core/attachments#uploadAttachment` (the generic, already-built mechanism
 * every module uses -- see the migration's own docstring for why this story does not
 * duplicate it), then records this module's own compliance-specific categorization row on
 * top of it. Two writes, not one transaction (Supabase has no cross-request transaction
 * primitive this codebase uses elsewhere either) -- if the second write fails, the
 * uploaded file is orphaned (no `compliance_evidence` row references it) rather than
 * partially-recorded; a real, small, named gap rather than a silent risk of a
 * categorization row pointing at a file that was never actually stored.
 *
 * The underlying attachment's own `(entity_type, entity_id)` mirrors this evidence's own
 * `relatedEntityType`/`relatedEntityId` when known (prefixed `gst_`, e.g.
 * `gst_return_period`), or falls back to `("gst_business", businessId)` for business-level
 * evidence with no single related object -- so `core.attachments`' own generic
 * `listAttachmentsForEntity` stays independently useful for that same object, not only
 * reachable through this module's own `compliance_evidence` row.
 */
export async function recordComplianceEvidence(businessId: string, input: RecordComplianceEvidenceInput): Promise<ComplianceEvidenceWithAttachment> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.manage_evidence");

  const validationError = validateRelatedEntityPair(input.relatedEntityType, input.relatedEntityId);
  if (validationError) throw new Error(validationError);

  const attachmentEntityType = input.relatedEntityType ? `gst_${input.relatedEntityType}` : "gst_business";
  const attachmentEntityId = input.relatedEntityId ?? businessId;

  const attachment = await uploadAttachment({
    businessId,
    entityType: attachmentEntityType,
    entityId: attachmentEntityId,
    file: input.file,
    fileName: input.fileName,
  });

  const supabase = await createClient();
  const trimmedDescription = input.description?.trim();
  const { data, error } = await supabase
    .from("compliance_evidence")
    .insert({
      business_id: businessId,
      attachment_id: attachment.id,
      evidence_type: input.evidenceType,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
      description: trimmedDescription || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const created = await getComplianceEvidenceById(businessId, data.id);
  if (!created) throw new Error("Evidence was recorded but could not be read back.");
  return created;
}
