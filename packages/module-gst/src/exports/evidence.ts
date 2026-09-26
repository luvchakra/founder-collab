// EXP-FIN-16 -- Finance Evidence export (/finance/evidence).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listAuditActors } from "@cofounderai/core/audit/queries";
import { listComplianceEvidence } from "../lib/evidence/queries";
import type { ComplianceEvidenceWithAttachment } from "../lib/evidence/types";
import { EVIDENCE_TYPE_LABEL, RELATED_ENTITY_LABEL } from "./labels";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS } from "./shared";

/**
 * Metadata only (§18, rule 5): the evidence register as the page lists it
 * (`listComplianceEvidence(businessId)`, newest first) -- what each file is, what it
 * relates to, who uploaded it and when, how long it is kept. The page signs a download URL
 * per file; this export never calls `getAttachmentSignedUrl`, never reads a storage
 * bucket or path, and never includes a file's bytes. The page reads with no permission
 * check (`gst.manage_evidence` only enables uploads).
 */
export const financeEvidenceExport: ExportAdapter<Record<string, never>> = {
  id: "finance.evidence",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const [evidence, actors] = await Promise.all([
      listComplianceEvidence(context.businessId),
      listAuditActors(context.businessId),
    ]);
    const nameOf = new Map(actors.map((a) => [a.id, a.name]));

    return {
      module: FINANCE_FILE_MODULE,
      resource: "evidence",
      title: "Compliance evidence",
      sheets: [
        {
          sheetName: "Evidence",
          rows: evidence,
          columns: [
            {
              key: "file",
              header: "Evidence",
              getValue: (e: ComplianceEvidenceWithAttachment) => e.attachment?.file_name ?? "(file unavailable)",
            },
            {
              key: "category",
              header: "Category",
              getValue: (e: ComplianceEvidenceWithAttachment) => EVIDENCE_TYPE_LABEL[e.evidenceType] ?? e.evidenceType,
            },
            { key: "description", header: "Description", getValue: (e: ComplianceEvidenceWithAttachment) => e.description },
            {
              key: "related_type",
              header: "Related to",
              getValue: (e: ComplianceEvidenceWithAttachment) =>
                e.relatedEntityType ? RELATED_ENTITY_LABEL[e.relatedEntityType] ?? e.relatedEntityType : null,
            },
            { key: "related_id", header: "Related record", getValue: (e: ComplianceEvidenceWithAttachment) => e.relatedEntityId },
            {
              key: "file_type",
              header: "File type",
              getValue: (e: ComplianceEvidenceWithAttachment) => e.attachment?.content_type ?? null,
            },
            {
              key: "size",
              header: "Size (bytes)",
              type: "integer",
              getValue: (e: ComplianceEvidenceWithAttachment) => e.attachment?.size_bytes ?? null,
            },
            { key: "uploaded", header: "Uploaded", type: "datetime", getValue: (e: ComplianceEvidenceWithAttachment) => e.createdAt },
            {
              key: "owner",
              header: "Uploaded by",
              getValue: (e: ComplianceEvidenceWithAttachment) => nameOf.get(e.uploadedBy) ?? e.uploadedBy,
            },
            {
              key: "retention",
              header: "Retain until",
              type: "date",
              getValue: (e: ComplianceEvidenceWithAttachment) => e.retentionUntil,
            },
            {
              key: "status",
              header: "File status",
              getValue: (e: ComplianceEvidenceWithAttachment) => (e.attachment ? "On file" : "File unavailable"),
            },
          ],
        },
      ],
    };
  },
};
