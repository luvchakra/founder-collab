import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { isJurisdictionSupported } from "../compliance/jurisdictions";
import { isExemptionCertificateTypeSupported } from "./types";

/** COMPLY-P1-02.6. Every write requires the module license and the dedicated
 * `gst.manage_exemption_certificates` permission -- see the migration's own docstring for
 * why this is its own permission rather than the broader `settings.manage`. */

export type RecordExemptionCertificateInput = {
  partyId: string;
  country?: string;
  jurisdiction?: string | null;
  certificateType: string;
  certificateNumber: string;
  issuedDate: string;
  expiresAt?: string | null;
  attachmentId?: string | null;
  notes?: string | null;
};

export async function recordExemptionCertificate(businessId: string, input: RecordExemptionCertificateInput): Promise<string> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.manage_exemption_certificates");

  if (!isExemptionCertificateTypeSupported(input.certificateType)) {
    throw new Error(`"${input.certificateType}" isn't a recognized exemption certificate type.`);
  }
  const country = input.country ?? "US";
  const jurisdiction = input.jurisdiction ?? null;
  if (jurisdiction != null && !isJurisdictionSupported(country, jurisdiction)) {
    throw new Error(`"${jurisdiction}" isn't a recognized jurisdiction for ${country}.`);
  }
  if (!input.certificateNumber.trim()) {
    throw new Error("certificateNumber is required.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exemption_certificates")
    .insert({
      business_id: businessId,
      party_id: input.partyId,
      country,
      jurisdiction,
      certificate_type: input.certificateType,
      certificate_number: input.certificateNumber.trim(),
      issued_date: input.issuedDate,
      expires_at: input.expiresAt ?? null,
      attachment_id: input.attachmentId ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Attaches (or replaces) the scanned copy of an already-recorded certificate -- a
 * business may record the certificate's own facts first and upload the scan later. */
export async function attachExemptionCertificateFile(businessId: string, certificateId: string, attachmentId: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.manage_exemption_certificates");

  const supabase = await createClient();
  const { error } = await supabase.from("exemption_certificates").update({ attachment_id: attachmentId }).eq("business_id", businessId).eq("id", certificateId);
  if (error) throw error;
}

/** Marks a certificate revoked -- never deletes it (backlog rule 13: preserve historical
 * filing/evidence state -- a business must still be able to show it once relied on this
 * certificate for whichever period it was active). */
export async function revokeExemptionCertificate(businessId: string, certificateId: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.manage_exemption_certificates");

  const supabase = await createClient();
  const { error } = await supabase.from("exemption_certificates").update({ status: "revoked" }).eq("business_id", businessId).eq("id", certificateId);
  if (error) throw error;
}
