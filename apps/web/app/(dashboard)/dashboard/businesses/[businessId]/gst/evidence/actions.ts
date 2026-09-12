"use server";

import { revalidatePath } from "next/cache";
import { recordComplianceEvidence } from "@cofounderai/module-gst/lib/evidence/mutations";
import { EVIDENCE_TYPES, type EvidenceType } from "@cofounderai/module-gst/lib/evidence/types";
import type { RecordEvidenceActionState } from "@cofounderai/module-gst/components/evidence/evidence-upload-form";

function isEvidenceType(value: string): value is EvidenceType {
  return (EVIDENCE_TYPES as readonly string[]).includes(value);
}

/** COMPLY-P0-10.1/COMPLY-P0-11 (Evidence Repository UI). No `relatedEntityType`/
 * `relatedEntityId` input on this first cut of the form -- this page is the general
 * business-level Evidence list, not a specific return period/e-invoice/etc.'s own
 * detail page (which don't yet have their own "attach evidence here" panel); every
 * upload through this form is business-level evidence, matching
 * `recordComplianceEvidence`'s own documented `("gst_business", businessId)` fallback. */
export async function recordComplianceEvidenceAction(
  businessId: string,
  _prevState: RecordEvidenceActionState,
  formData: FormData,
): Promise<RecordEvidenceActionState> {
  const file = formData.get("file");
  const evidenceType = String(formData.get("evidence_type") ?? "");
  const description = String(formData.get("description") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (!isEvidenceType(evidenceType)) {
    return { error: "Select what kind of evidence this is." };
  }

  try {
    await recordComplianceEvidence(businessId, {
      file,
      fileName: file.name,
      evidenceType,
      description: description || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record this evidence." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}/gst/evidence`);
  return { success: true };
}
