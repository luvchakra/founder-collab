import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { Attachment } from "@cofounderai/core/attachments/types";
import { createClient } from "../../db/server";
import type { ComplianceEvidence, ComplianceEvidenceWithAttachment, EvidenceType, RelatedEntityType } from "./types";

const EVIDENCE_COLUMNS = "id, business_id, attachment_id, evidence_type, related_entity_type, related_entity_id, description, uploaded_by, created_at";

function mapRow(row: {
  id: string;
  business_id: string;
  attachment_id: string;
  evidence_type: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  description: string | null;
  uploaded_by: string;
  created_at: string;
}): ComplianceEvidence {
  return {
    id: row.id,
    businessId: row.business_id,
    attachmentId: row.attachment_id,
    evidenceType: row.evidence_type as EvidenceType,
    relatedEntityType: row.related_entity_type as RelatedEntityType | null,
    relatedEntityId: row.related_entity_id,
    description: row.description,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

async function attachAttachments(rows: ComplianceEvidence[]): Promise<ComplianceEvidenceWithAttachment[]> {
  if (rows.length === 0) return [];
  const core = await createCoreClient({ schema: "core" });
  const { data, error } = await core.from("attachments").select("*").in("id", rows.map((r) => r.attachmentId));
  if (error) throw error;
  const byId = new Map((data as Attachment[]).map((a) => [a.id, a]));
  return rows.map((row) => ({ ...row, attachment: byId.get(row.attachmentId) ?? null }));
}

/** Every evidence record for a business, newest first, optionally narrowed to one
 * specific compliance object -- the shape both a general "Evidence" list page and a
 * specific return period/e-invoice/etc.'s own "attached evidence" panel need. */
export async function listComplianceEvidence(
  businessId: string,
  filter?: { relatedEntityType: RelatedEntityType; relatedEntityId: string },
): Promise<ComplianceEvidenceWithAttachment[]> {
  const supabase = await createClient();
  let query = supabase.from("compliance_evidence").select(EVIDENCE_COLUMNS).eq("business_id", businessId);
  if (filter) query = query.eq("related_entity_type", filter.relatedEntityType).eq("related_entity_id", filter.relatedEntityId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return attachAttachments(data.map(mapRow));
}

export async function getComplianceEvidenceById(businessId: string, evidenceId: string): Promise<ComplianceEvidenceWithAttachment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("compliance_evidence").select(EVIDENCE_COLUMNS).eq("business_id", businessId).eq("id", evidenceId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [withAttachment] = await attachAttachments([mapRow(data)]);
  return withAttachment ?? null;
}
