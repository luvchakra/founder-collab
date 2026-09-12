import { createClient } from "../../db/server";
import { exemptionCertificateCoversState, isExemptionCertificateValid } from "./validity";
import type { ExemptionCertificate } from "./types";

/** COMPLY-P1-02.6. */

function mapRow(row: {
  id: string;
  business_id: string;
  party_id: string;
  country: string;
  jurisdiction: string | null;
  certificate_type: string;
  certificate_number: string;
  issued_date: string;
  expires_at: string | null;
  status: string;
  attachment_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): ExemptionCertificate {
  return {
    id: row.id,
    businessId: row.business_id,
    partyId: row.party_id,
    country: row.country,
    jurisdiction: row.jurisdiction,
    certificateType: row.certificate_type as ExemptionCertificate["certificateType"],
    certificateNumber: row.certificate_number,
    issuedDate: row.issued_date,
    expiresAt: row.expires_at,
    status: row.status as ExemptionCertificate["status"],
    attachmentId: row.attachment_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = "id, business_id, party_id, country, jurisdiction, certificate_type, certificate_number, issued_date, expires_at, status, attachment_id, notes, created_at, updated_at";

/** Every exemption certificate on file for one customer, newest first. */
export async function listExemptionCertificatesForParty(businessId: string, partyId: string): Promise<ExemptionCertificate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exemption_certificates")
    .select(COLUMNS)
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("issued_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function getExemptionCertificate(businessId: string, certificateId: string): Promise<ExemptionCertificate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("exemption_certificates").select(COLUMNS).eq("business_id", businessId).eq("id", certificateId).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/**
 * Whether this business has ANY currently-valid exemption certificate on file for this
 * party that covers `stateCode`, as of `asOf` (defaults to today) -- the one question a
 * future sale-time tax determination would actually need to ask. Returns the certificate
 * itself (so a caller can cite it, e.g. as a `gst.tax_determinations.rule_refs`-style
 * traceability reference) or `null` if none qualifies. When several qualify, the most
 * recently issued one is preferred -- a real, if unlikely, case (a customer presents a
 * renewed certificate before the old one's own listed expiry).
 */
export async function getValidExemptionCertificateForParty(
  businessId: string,
  partyId: string,
  stateCode: string,
  asOf?: string,
): Promise<ExemptionCertificate | null> {
  const asOfDate = asOf ?? new Date().toISOString().slice(0, 10);
  const certificates = await listExemptionCertificatesForParty(businessId, partyId);
  const qualifying = certificates.filter(
    (cert) => exemptionCertificateCoversState(cert, stateCode) && isExemptionCertificateValid(cert, asOfDate).valid,
  );
  return qualifying[0] ?? null;
}
