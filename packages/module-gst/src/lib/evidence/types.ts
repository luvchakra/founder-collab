import type { Attachment } from "@cofounderai/core/attachments/types";

/** COMPLY-P0-10.1 (Evidence Repository). See the `gst.compliance_evidence` migration's
 * own docstring for why this is a thin categorization/linkage layer over a
 * `core.attachments` row, not a second copy of the file itself. */

export type EvidenceType = "return_acknowledgment" | "payment_challan" | "government_notice" | "audit_response" | "other";
export const EVIDENCE_TYPES: readonly EvidenceType[] = ["return_acknowledgment", "payment_challan", "government_notice", "audit_response", "other"];

export type RelatedEntityType = "return_period" | "einvoice" | "eway_bill" | "reconciliation_exception" | "tax_registration";
export const RELATED_ENTITY_TYPES: readonly RelatedEntityType[] = ["return_period", "einvoice", "eway_bill", "reconciliation_exception", "tax_registration"];

export type ComplianceEvidence = {
  id: string;
  businessId: string;
  attachmentId: string;
  evidenceType: EvidenceType;
  relatedEntityType: RelatedEntityType | null;
  relatedEntityId: string | null;
  description: string | null;
  uploadedBy: string;
  createdAt: string;
};

/** A `ComplianceEvidence` row joined with its own `core.attachments` row -- the shape a
 * UI actually needs (file name, size, a signed download URL) without a second round
 * trip. Joined in application code, not a database join -- `gst.compliance_evidence` and
 * `core.attachments` live in different Postgres schemas, and this module's Supabase
 * client is schema-scoped (`db/server.ts`), same cross-schema-combination pattern every
 * other `gst` query that reads `core` data alongside its own already uses. */
export type ComplianceEvidenceWithAttachment = ComplianceEvidence & { attachment: Attachment | null };
