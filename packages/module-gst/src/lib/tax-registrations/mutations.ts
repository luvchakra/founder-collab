import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { isRegimeSupported } from "../compliance/countries";
import { canonicalJurisdictionName } from "../compliance/jurisdictions";
import { buildGstRegistrationMetadata, type GstRegistrationProfile } from "./gst-registration-profile";
import type { TaxRegistrationInput } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/**
 * COMPLY-P0-04.1 (GSTIN Management): the decision this table's own migration comment
 * flagged as this story's job -- "explicitly migrates that single-value form
 * [`core.business_settings.gstin`/`state`] over" -- without touching `module-inventory`/
 * `module-fsm`'s own source (both read `core.business_settings.gstin`/`state` directly
 * for live CGST/SGST-vs-IGST math, e.g. `module-inventory/lib/sales-orders/mutations.ts`;
 * re-pointing those reads at `gst.tax_registrations` instead is out of scope for a run
 * restricted to `module-gst`, and would be a bigger cross-module change than one story
 * should make anyway).
 *
 * Instead of a two-way sync or a cross-module refactor, this is a one-way mirror: whenever
 * a business's PRIMARY India/GST registration changes (a new one is created as primary, or
 * an existing one is promoted), the registration's own number/jurisdiction are copied onto
 * `core.business_settings.gstin`/`state` -- the exact two columns every existing consumer
 * already reads. From the moment a business starts using this module's own multi-
 * registration UI, it transparently becomes the effective source of truth for that shared
 * field, with zero changes needed in any other module. The legacy single-value `GST
 * Profile` form (`lib/profile/mutations.ts`'s `upsertGstProfile`) is left fully
 * functional as a manual override/quick-edit path for a business that hasn't adopted
 * multi-registration management -- editing it after this mirror has run simply overwrites
 * the mirrored value again, the same one-field-wins-last-write semantics
 * `core.business_settings` already has for every other setting.
 *
 * Deliberately scoped to country `IN` / regime `GST` only -- `gstin`/`state` are
 * India-GST-specific columns; mirroring, say, an EU VAT number into the `gstin` column
 * would be a category error, not a generalization of this story's own job.
 */
export function isIndiaGstRegistration(country: string, regime: string): boolean {
  return country === "IN" && regime === "GST";
}

async function mirrorPrimaryGstinToBusinessSettings(
  businessId: string,
  country: string,
  regime: string,
  registrationNumber: string,
  jurisdiction: string | null,
): Promise<void> {
  if (!isIndiaGstRegistration(country, regime)) return;

  const core = await coreClient();
  const { error } = await core.from("business_settings").upsert({
    business_id: businessId,
    gstin: registrationNumber,
    state: jurisdiction,
  });
  if (error) throw error;
}

/**
 * COMPLY-P0-02.1 (Tax Registration): adds one registration for a business. Generic
 * across country/regime -- validates only that the country/regime pair is one this build
 * actually implements (`isRegimeSupported`, the same catalog check
 * `setComplianceCountry`/`setComplianceRegime` already use), not any India-specific shape
 * (GSTIN format validation is COMPLY-P0-04.1's own job, once the India-specific UI wraps
 * this generic function).
 *
 * COMPLY-P0-02.2 (Tax Jurisdiction): a non-empty `jurisdiction` must match one of that
 * country's own known jurisdictions (`canonicalJurisdictionName`, backed by
 * `lib/compliance/jurisdictions.ts`) -- an empty/null jurisdiction is left alone, since
 * plenty of regimes have no sub-national jurisdiction concept to validate against at all.
 * The stored value is the catalog's own canonical spelling, not whatever casing/whitespace
 * the caller passed in, so downstream matching (e.g. a future tax-determination engine
 * comparing registration jurisdiction to a document's place of supply) never has to
 * re-normalize it.
 *
 * When `isPrimary` is requested, first clears any existing primary for the same
 * business/country/regime -- the unique partial index
 * (`tax_registrations_one_primary_per_regime`) only allows one, and an insert that tried
 * to set a second would just fail with a constraint violation instead of "moving" primary
 * status. Two sequential statements, not one transaction -- a rare concurrent "make X and
 * Y both primary at once" race is left to the unique index itself to reject the loser,
 * same acceptable-race tradeoff this codebase already makes elsewhere for multi-statement
 * client-side writes (there is no request-scoped multi-statement transaction primitive
 * available from this RLS-scoped client).
 */
export async function createTaxRegistration(businessId: string, input: TaxRegistrationInput): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  if (!isRegimeSupported(input.country, input.regime)) {
    throw new Error(`${input.regime} isn't a valid tax regime for ${input.country}.`);
  }
  if (!input.registrationNumber.trim()) {
    throw new Error("A registration number is required.");
  }

  let jurisdiction: string | null = null;
  if (input.jurisdiction && input.jurisdiction.trim()) {
    const canonical = canonicalJurisdictionName(input.country, input.jurisdiction);
    if (!canonical) {
      throw new Error(`"${input.jurisdiction}" isn't a recognized jurisdiction for ${input.country}.`);
    }
    jurisdiction = canonical;
  }

  const supabase = await createClient();

  if (input.isPrimary) {
    await clearPrimaryTaxRegistration(businessId, input.country, input.regime);
  }

  const registrationNumber = input.registrationNumber.trim();
  const { error } = await supabase.from("tax_registrations").insert({
    business_id: businessId,
    country: input.country,
    jurisdiction,
    regime: input.regime,
    registration_number: registrationNumber,
    is_primary: input.isPrimary,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;

  if (input.isPrimary) {
    await mirrorPrimaryGstinToBusinessSettings(businessId, input.country, input.regime, registrationNumber, jurisdiction);
  }
}

async function clearPrimaryTaxRegistration(businessId: string, country: string, regime: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tax_registrations")
    .update({ is_primary: false })
    .eq("business_id", businessId)
    .eq("country", country)
    .eq("regime", regime)
    .eq("is_primary", true);
  if (error) throw error;
}

/** Marks one existing registration as the primary one for its own business/country/
 * regime, demoting whichever registration held that spot before. */
export async function setPrimaryTaxRegistration(businessId: string, registrationId: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  const supabase = await createClient();
  const { data: target, error: fetchError } = await supabase
    .from("tax_registrations")
    .select("country, regime, registration_number, jurisdiction")
    .eq("business_id", businessId)
    .eq("id", registrationId)
    .single();
  if (fetchError) throw fetchError;

  await clearPrimaryTaxRegistration(businessId, target.country, target.regime);

  const { error } = await supabase
    .from("tax_registrations")
    .update({ is_primary: true })
    .eq("business_id", businessId)
    .eq("id", registrationId);
  if (error) throw error;

  await mirrorPrimaryGstinToBusinessSettings(
    businessId,
    target.country,
    target.regime,
    target.registration_number,
    target.jurisdiction,
  );
}

/**
 * Retires a registration -- ADR-9's "cancel never deletes" discipline applies at the row
 * level here too: a cancelled GSTIN stays on record for every document/return that
 * referenced it while active (backlog rule 13, "preserve historical filing/evidence
 * state"). There is deliberately no `deleteTaxRegistration` at all -- the table's own
 * migration has no delete RLS policy either.
 */
export async function setTaxRegistrationStatus(
  businessId: string,
  registrationId: string,
  status: "active" | "cancelled" | "suspended",
): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tax_registrations")
    .update({ registration_status: status })
    .eq("business_id", businessId)
    .eq("id", registrationId);
  if (error) throw error;
}

/**
 * COMPLY-P0-04.2 (GST Profile): sets the India-GST-specific attributes a registration's
 * own `metadata` jsonb holds (`gst-registration-profile.ts`'s own `GstRegistrationProfile`)
 * plus `registered_from`, the one field this story adds that already had its own column
 * (COMPLY-P0-02.1) rather than living in `metadata` -- both are "editing this
 * registration's profile" from a user's point of view even though they land in two
 * different columns underneath.
 *
 * India-GST-only by construction: fetches the row first and refuses (rather than silently
 * writing India-shaped keys into some other regime's metadata) unless
 * `isIndiaGstRegistration` says it's actually a country=IN/regime=GST registration -- the
 * same guard the business-settings mirror above already uses.
 * Merges onto the row's existing metadata (`buildGstRegistrationMetadata`) rather than
 * replacing it outright, so a future regime-agnostic caller that ever stores its own keys
 * in this same jsonb bucket doesn't get silently clobbered by an India-only edit.
 */
export async function setGstRegistrationProfile(
  businessId: string,
  registrationId: string,
  input: { registeredFrom: string | null; profile: GstRegistrationProfile },
): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  const supabase = await createClient();
  const { data: target, error: fetchError } = await supabase
    .from("tax_registrations")
    .select("country, regime, metadata")
    .eq("business_id", businessId)
    .eq("id", registrationId)
    .single();
  if (fetchError) throw fetchError;

  if (!isIndiaGstRegistration(target.country, target.regime)) {
    throw new Error("The GST profile (registration type, return frequency, e-invoice eligibility) only applies to India GST registrations.");
  }

  const metadata = buildGstRegistrationMetadata((target.metadata as Record<string, unknown>) ?? {}, input.profile);

  const { error } = await supabase
    .from("tax_registrations")
    .update({ registered_from: input.registeredFrom, metadata })
    .eq("business_id", businessId)
    .eq("id", registrationId);
  if (error) throw error;
}
