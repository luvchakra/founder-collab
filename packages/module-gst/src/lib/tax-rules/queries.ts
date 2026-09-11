import { createClient } from "../../db/server";
import type { TaxRule } from "./types";

export type TaxRuleLineage = {
  country: string;
  regime: string;
  /** `null` -- same "no sub-national jurisdiction concept" convention as
   * gst.tax_registrations.jurisdiction -- matches only rows where jurisdiction is also
   * literally null, not "any jurisdiction." */
  jurisdiction: string | null;
  ruleKey: string;
};

/**
 * COMPLY-P0-02.3 (Versioned Tax Rules): the rule in effect for a lineage as of a given
 * date, or `null` if no version of it covers that date (e.g. nothing has been published
 * yet, or the lineage lapsed with no successor). Defaults `asOf` to today.
 *
 * Picks the highest `version` among rows whose effective range covers `asOf`
 * (`effective_from <= asOf` and (`effective_to` is null or `effective_to > asOf`)) --
 * relies on the RLS policy's own license gate for authorization, same as every other
 * read-only query in this module (`lib/compliance/queries.ts`,
 * `lib/tax-registrations/queries.ts`); there is no `businessId` parameter because this
 * table isn't tenant-scoped at all (see the migration's own comment for why).
 *
 * Deliberately does NOT fall back from a specific jurisdiction to a null
 * (national-level) rule when no jurisdiction-specific override exists -- that fallback
 * behavior is real tax-determination logic belonging to COMPLY-P0-04.5, not this
 * generic lookup.
 */
export async function getEffectiveTaxRule(lineage: TaxRuleLineage, asOf?: string): Promise<TaxRule | null> {
  const asOfDate = asOf ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  let query = supabase
    .from("tax_rules")
    .select("*")
    .eq("country", lineage.country)
    .eq("regime", lineage.regime)
    .eq("rule_key", lineage.ruleKey)
    .lte("effective_from", asOfDate)
    .or(`effective_to.is.null,effective_to.gt.${asOfDate}`)
    .order("version", { ascending: false })
    .limit(1);
  query = lineage.jurisdiction === null ? query.is("jurisdiction", null) : query.eq("jurisdiction", lineage.jurisdiction);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

/** Every published version of one rule lineage, newest version first -- the full
 * audit/history view (backlog rule 13, "preserve historical filing/evidence state":
 * every version a document may have been taxed under must stay inspectable, not just the
 * currently-active one). */
export async function listTaxRuleVersions(lineage: TaxRuleLineage): Promise<TaxRule[]> {
  const supabase = await createClient();
  let query = supabase
    .from("tax_rules")
    .select("*")
    .eq("country", lineage.country)
    .eq("regime", lineage.regime)
    .eq("rule_key", lineage.ruleKey)
    .order("version", { ascending: false });
  query = lineage.jurisdiction === null ? query.is("jurisdiction", null) : query.eq("jurisdiction", lineage.jurisdiction);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
