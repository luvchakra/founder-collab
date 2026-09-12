/**
 * COMPLY-P1-04.4 (Peppol Identifier): "The Peppol network identifier concept a business
 * needs for InvoiceNow." Same "regime-specific attributes live in `gst.tax_registrations.
 * metadata`, never a bespoke column on the generic table" pattern
 * `gst-registration-profile.ts` (COMPLY-P0-04.2, India) already established -- this is the
 * Singapore counterpart, scoped to country=SG/regime=GST registrations only (matching
 * that file's own `isIndiaGstRegistration`-style scoping discipline).
 *
 * Format verified via WebSearch 2026-09-12 (peppol.org's own "Singapore - OpenPeppol"
 * country profile page title, terraadvisoryservices.com, invoicenow.biz, poppel.app --
 * all independently agreeing): a Singapore Peppol Participant ID is `0195:sguen<UEN>`
 * (scheme `0195` = the ISO 6523 ICD for Singapore's own UEN registry, administered by
 * ACRA) for a business with a UEN, or (since November 2025, per the same sources)
 * `0195:sggst<GSTN>` for an entity with a valid GST registration number but no UEN.
 *
 * This is a STRUCTURAL format check only -- scheme prefix + subtype + a non-empty
 * alphanumeric identifier -- NOT a live Peppol Directory lookup confirming the ID is
 * actually registered and reachable on the network, and NOT a UEN/GST-number checksum
 * validation (ACRA's own UEN check-digit algorithm was not independently verified this
 * session). Same "format+checksum where verifiable, format-only where a live network
 * check is out of reach" honesty this module's own COMPLY-P1-01.5 (VAT ID Validation)
 * entry already established for VIES.
 */

export type SgTaxRegistrationProfile = {
  peppolId: string | null;
};

const PEPPOL_ID_PATTERN = /^0195:(sguen|sggst)[a-z0-9]+$/i;

export function isValidSgPeppolId(value: string): boolean {
  return PEPPOL_ID_PATTERN.test(value.trim());
}

const DEFAULT_PROFILE: SgTaxRegistrationProfile = { peppolId: null };

/**
 * Reads a registration's own `metadata` jsonb into a typed profile, defaulting a missing/
 * invalid `peppol_id` to `null` rather than throwing -- same "never null-check a separate
 * 'no profile set yet' state" convention `parseGstRegistrationProfile` already
 * established. A structurally-invalid stored value (should not happen via
 * `buildSgRegistrationMetadata` below, but defensive against any other write path) is
 * treated the same as absent, never surfaced as a thrown error from a read.
 */
export function parseSgRegistrationProfile(metadata: Record<string, unknown>): SgTaxRegistrationProfile {
  const peppolId = typeof metadata.peppol_id === "string" && isValidSgPeppolId(metadata.peppol_id) ? metadata.peppol_id : DEFAULT_PROFILE.peppolId;
  return { peppolId };
}

/** The metadata jsonb payload to write for a given profile, merged onto whatever else a
 * row's metadata already holds -- never a wholesale replace, same convention
 * `buildGstRegistrationMetadata` already established. `peppolId: null` clears the key
 * rather than storing a literal `null` string, matching `metadata`'s own "absent means
 * not set" convention. */
export function buildSgRegistrationMetadata(existing: Record<string, unknown>, profile: SgTaxRegistrationProfile): Record<string, unknown> {
  const rest = { ...existing };
  delete rest.peppol_id;
  return profile.peppolId ? { ...rest, peppol_id: profile.peppolId } : rest;
}
