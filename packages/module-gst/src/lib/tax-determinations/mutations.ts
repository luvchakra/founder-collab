import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { isRegimeSupported } from "../compliance/countries";
import { canonicalJurisdictionName } from "../compliance/jurisdictions";
import { isTreatmentSupported } from "../compliance/treatments";
import type { TaxDetermination, TaxDeterminationInput } from "./types";

/**
 * COMPLY-P0-02.5 (Tax Determination Snapshot): records the result of taxing one
 * transaction. Only `requireModule` is checked, not a specific permission -- see the
 * table's own migration comment for why: recording a determination is an automatic
 * byproduct of a business member creating/completing an ordinary transaction, not a
 * settings-level action, so this deliberately does NOT gate on `settings.manage` the way
 * `createTaxRegistration` does.
 *
 * There is no update/delete counterpart at all -- a determination is immutable once
 * written (the table's own migration has no UPDATE/DELETE policy either). A
 * miscalculation or a later rule supersession is corrected by calling this again with a
 * fresh snapshot, never by mutating the old row -- callers that need "what applies right
 * now" should read `getLatestTaxDetermination`, not assume the first row is still current.
 */
export async function recordTaxDetermination(businessId: string, input: TaxDeterminationInput): Promise<TaxDetermination> {
  await requireModule(businessId, "gst");

  if (!isRegimeSupported(input.country, input.regime)) {
    throw new Error(`${input.regime} isn't a valid tax regime for ${input.country}.`);
  }
  if (!input.sourceModule.trim() || !input.sourceReference.trim()) {
    throw new Error("A source module and reference are required.");
  }
  if (!Number.isFinite(input.taxableAmount) || !Number.isFinite(input.taxAmount)) {
    throw new Error("Taxable amount and tax amount must both be finite numbers.");
  }

  let jurisdiction: string | null = null;
  if (input.jurisdiction && input.jurisdiction.trim()) {
    const canonical = canonicalJurisdictionName(input.country, input.jurisdiction);
    if (!canonical) {
      throw new Error(`"${input.jurisdiction}" isn't a recognized jurisdiction for ${input.country}.`);
    }
    jurisdiction = canonical;
  }

  let treatment: string | null = null;
  if (input.treatment) {
    if (!isTreatmentSupported(input.treatment)) {
      throw new Error(`"${input.treatment}" isn't a recognized tax treatment.`);
    }
    treatment = input.treatment;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_determinations")
    .insert({
      business_id: businessId,
      source_module: input.sourceModule.trim(),
      source_reference: input.sourceReference.trim(),
      country: input.country,
      jurisdiction,
      regime: input.regime,
      treatment,
      taxable_amount: input.taxableAmount,
      tax_amount: input.taxAmount,
      rule_refs: input.ruleRefs ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
