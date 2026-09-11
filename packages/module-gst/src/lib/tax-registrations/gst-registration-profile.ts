/**
 * COMPLY-P0-04.2 (GST Profile): "Regular/composition, registration date, state, return
 * frequency and e-invoice eligibility." `state` is already `gst.tax_registrations.jurisdiction`
 * (COMPLY-P0-02.2/04.1) and `registration date` is already the `registered_from` column
 * (COMPLY-P0-02.1) -- this file is the remaining three, the India-GST-specific attributes
 * that table's own migration comment reserved its `metadata jsonb` bucket for:
 * "India's registration_type regular/composition/unregistered, return frequency,
 * e-invoice eligibility."
 *
 * One correction from that comment, worth naming explicitly: the OLD single-value form
 * (`core.business_settings.gst_registration_type`) has a THIRD option, "unregistered,"
 * because that form describes a business that might have no GSTIN at all. A row in
 * `gst.tax_registrations` cannot mean that -- it only ever exists once a real GSTIN has
 * been added (COMPLY-P0-04.1's own create form requires and validates one) -- so
 * "unregistered" has no meaning as a PER-REGISTRATION classification here. A business
 * with zero registrations is already visible as an empty Registrations list; this type
 * only ever needs to distinguish *how* an existing registration is taxed.
 *
 * Deliberately scoped to country=IN/regime=GST callers only (same discipline
 * COMPLY-P0-04.1's `isIndiaGstRegistration` established) -- this vocabulary is
 * India-GST-specific, not a generic cross-regime concept; a future country pack defines
 * its own metadata shape for its own registrations (backlog rule 4/5), not this file's job
 * to anticipate.
 *
 * Every field here is a user-DECLARED fact about a registration, not something this module
 * computes or verifies (backlog rule 12: distinguish regulatory fact / software rule /
 * calculated result / AI explanation) -- e-invoice eligibility in particular is not
 * derived from turnover or any other signal here; it is whatever the business tells
 * WonderArc is true today, an input COMPLY-P0-05's future e-invoice eligibility *engine*
 * will read, not a compliance claim this story makes on the business's behalf.
 */

export type GstRegistrationType = "regular" | "composition";
export type GstReturnFrequency = "monthly" | "quarterly";

export type GstRegistrationProfile = {
  registrationType: GstRegistrationType;
  returnFrequency: GstReturnFrequency;
  eInvoiceEligible: boolean;
};

export const GST_REGISTRATION_TYPES: readonly GstRegistrationType[] = ["regular", "composition"];
export const GST_RETURN_FREQUENCIES: readonly GstReturnFrequency[] = ["monthly", "quarterly"];

const DEFAULT_PROFILE: GstRegistrationProfile = {
  registrationType: "regular",
  returnFrequency: "monthly",
  eInvoiceEligible: false,
};

export function isGstRegistrationType(value: string): value is GstRegistrationType {
  return (GST_REGISTRATION_TYPES as readonly string[]).includes(value);
}

export function isGstReturnFrequency(value: string): value is GstReturnFrequency {
  return (GST_RETURN_FREQUENCIES as readonly string[]).includes(value);
}

/**
 * Reads a registration's own `metadata` jsonb into a typed profile, defaulting any
 * missing/invalid field rather than throwing. A registration created before this story (or
 * by any future path that never sets these keys) has metadata `{}` -- every field
 * defaults explicitly (matching the migration's own `metadata jsonb not null default
 * '{}'`), so a caller never has to null-check "no profile set yet" as a separate state.
 */
export function parseGstRegistrationProfile(metadata: Record<string, unknown>): GstRegistrationProfile {
  const registrationType =
    typeof metadata.registration_type === "string" && isGstRegistrationType(metadata.registration_type)
      ? metadata.registration_type
      : DEFAULT_PROFILE.registrationType;
  const returnFrequency =
    typeof metadata.return_frequency === "string" && isGstReturnFrequency(metadata.return_frequency)
      ? metadata.return_frequency
      : DEFAULT_PROFILE.returnFrequency;
  const eInvoiceEligible =
    typeof metadata.e_invoice_eligible === "boolean" ? metadata.e_invoice_eligible : DEFAULT_PROFILE.eInvoiceEligible;

  return { registrationType, returnFrequency, eInvoiceEligible };
}

/**
 * The metadata jsonb payload to write for a given profile, merged onto whatever else a
 * row's metadata already holds -- never a wholesale replace. `gst.tax_registrations` is
 * generic across regimes even though only India writes profile metadata today, so this
 * stays defensive rather than assuming these three keys are the only ones that will ever
 * live in `metadata`.
 */
export function buildGstRegistrationMetadata(
  existing: Record<string, unknown>,
  profile: GstRegistrationProfile,
): Record<string, unknown> {
  return {
    ...existing,
    registration_type: profile.registrationType,
    return_frequency: profile.returnFrequency,
    e_invoice_eligible: profile.eInvoiceEligible,
  };
}
