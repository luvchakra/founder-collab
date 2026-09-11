import { createAdminClient } from "../../db/admin";
import { isRegimeSupported } from "../compliance/countries";
import { canonicalJurisdictionName } from "../compliance/jurisdictions";
import type { TaxRule, TaxRuleInput } from "./types";

/**
 * COMPLY-P0-02.3 (Versioned Tax Rules): publishes and supersedes rows in `gst.tax_rules`.
 *
 * Deliberately NOT gated by `requireModule`/`requirePermission` the way every other
 * mutation in this module is -- rule content is centrally curated (by whoever ships a
 * country/regime pack), not a business's own settings input, so there is no
 * `businessId`/end-user caller at all here yet (no UI, no server action calls this --
 * same "no UI page yet" scope 02.1/02.2 shipped). Runs entirely via `service_role`
 * (`db/admin.ts`) because the table's own RLS grants `authenticated` SELECT only, never
 * INSERT/UPDATE/DELETE (that migration's own comment) -- these functions exist to be
 * called from trusted, non-request-scoped contexts (a future admin tool or seed script,
 * COMPLY-P0-04.7's own job to build the India-specific caller for), not from a
 * request-scoped, RLS-authorized action.
 */

function validateInput(input: TaxRuleInput): { country: string; jurisdiction: string | null; regime: string; ruleKey: string } {
  if (!isRegimeSupported(input.country, input.regime)) {
    throw new Error(`${input.regime} isn't a valid tax regime for ${input.country}.`);
  }
  if (!input.ruleKey.trim()) {
    throw new Error("A rule key is required.");
  }
  if (!input.source.trim()) {
    throw new Error("A source reference is required for every tax rule.");
  }

  let jurisdiction: string | null = null;
  if (input.jurisdiction && input.jurisdiction.trim()) {
    const canonical = canonicalJurisdictionName(input.country, input.jurisdiction);
    if (!canonical) {
      throw new Error(`"${input.jurisdiction}" isn't a recognized jurisdiction for ${input.country}.`);
    }
    jurisdiction = canonical;
  }

  return { country: input.country, jurisdiction, regime: input.regime, ruleKey: input.ruleKey.trim() };
}

/** Publishes version 1 of a brand-new rule lineage. Fails (via the table's own unique
 * constraint) if this exact lineage/version already exists -- use `supersedeTaxRule` to
 * add a later version of an existing lineage instead. */
export async function publishTaxRule(input: TaxRuleInput): Promise<TaxRule> {
  const { country, jurisdiction, regime, ruleKey } = validateInput(input);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tax_rules")
    .insert({
      country,
      jurisdiction,
      regime,
      rule_key: ruleKey,
      value: input.value,
      version: 1,
      effective_from: input.effectiveFrom,
      source: input.source.trim(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Adds a new version to an existing rule lineage, closing the previously-open version's
 * `effective_to` at the new version's own `effective_from` -- never updates the prior
 * row's `value`/`source` in place (ADR-9 "cancel never deletes" / backlog rule 13
 * "preserve historical filing/evidence state": a document taxed under the old version
 * must still be able to look that exact row up afterward). Two sequential statements
 * against the admin client, not one transaction -- same acceptable-race tradeoff
 * `lib/tax-registrations/mutations.ts`'s own `setPrimaryTaxRegistration` already makes
 * (no request-scoped multi-statement transaction primitive available here either).
 *
 * Throws if there is no currently-open version to supersede (nothing published yet for
 * this lineage, or the new `effectiveFrom` doesn't actually come after the current
 * version's own `effective_from`) -- superseding is deliberately not usable to publish a
 * lineage's first version (`publishTaxRule` is the only way to start one).
 */
export async function supersedeTaxRule(input: TaxRuleInput): Promise<TaxRule> {
  const { country, jurisdiction, regime, ruleKey } = validateInput(input);
  const supabase = createAdminClient();

  let currentQuery = supabase
    .from("tax_rules")
    .select("*")
    .eq("country", country)
    .eq("regime", regime)
    .eq("rule_key", ruleKey)
    .is("effective_to", null)
    .order("version", { ascending: false })
    .limit(1);
  currentQuery = jurisdiction === null ? currentQuery.is("jurisdiction", null) : currentQuery.eq("jurisdiction", jurisdiction);
  const { data: current, error: currentError } = await currentQuery.maybeSingle();
  if (currentError) throw currentError;
  if (!current) {
    throw new Error(`No currently-open tax rule found for ${country}/${regime}/${ruleKey} to supersede.`);
  }
  if (input.effectiveFrom <= current.effective_from) {
    throw new Error(
      `A superseding version must take effect after the version it replaces (current version ${current.version} took effect ${current.effective_from}).`,
    );
  }

  const { error: closeError } = await supabase
    .from("tax_rules")
    .update({ effective_to: input.effectiveFrom })
    .eq("id", current.id);
  if (closeError) throw closeError;

  const { data, error } = await supabase
    .from("tax_rules")
    .insert({
      country,
      jurisdiction,
      regime,
      rule_key: ruleKey,
      value: input.value,
      version: current.version + 1,
      effective_from: input.effectiveFrom,
      source: input.source.trim(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
