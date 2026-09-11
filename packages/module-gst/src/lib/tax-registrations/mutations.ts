import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { isRegimeSupported } from "../compliance/countries";
import { canonicalJurisdictionName } from "../compliance/jurisdictions";
import type { TaxRegistrationInput } from "./types";

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

  const { error } = await supabase.from("tax_registrations").insert({
    business_id: businessId,
    country: input.country,
    jurisdiction,
    regime: input.regime,
    registration_number: input.registrationNumber.trim(),
    is_primary: input.isPrimary,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
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
    .select("country, regime")
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
