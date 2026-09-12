import { isTreatmentSupported, type TreatmentCode } from "../compliance/treatments";
import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import { US_SALES_TAX_REGIME } from "../tax-rules/us-sales-tax";
import type { ResolvedUsProductTaxabilityRule, UsProductTaxCategory, UsProductTaxabilityRuleValue } from "./types";

/**
 * COMPLY-P1-02.5: per-state, per-category taxability rules, read from the SAME
 * `gst.tax_rules` engine (COMPLY-P0-02.3) every other regime in this module already uses --
 * `rule_key = product_taxability_<category>`, `country = 'US'`, `jurisdiction = <state
 * code>`, `regime = 'SALES_TAX'` (`lib/tax-rules/us-sales-tax.ts`'s own regime constant,
 * reused rather than redefined). A new category or an 11th state needs only more rows, no
 * code change here -- same "generic engine, country/category packs are just rows" shape
 * `getEffectiveUsStateSalesTaxRate`/`getEffectiveUsEconomicNexusThreshold` already
 * established.
 */

export function usProductTaxabilityRule(stateCode: string, category: UsProductTaxCategory): TaxRuleLineage {
  return { country: "US", jurisdiction: stateCode, regime: US_SALES_TAX_REGIME, ruleKey: `product_taxability_${category}` };
}

/** Same defensive-parse-never-throw posture as `parseUsStateSalesTaxRateValue`. Refuses to
 * parse (returns `null`) rather than trust a malformed row: an unrecognized `treatment`
 * code, or a `ratePercent` that is neither a finite number nor `null`. */
export function parseUsProductTaxabilityRuleValue(value: Record<string, unknown>): UsProductTaxabilityRuleValue | null {
  const treatment = value.treatment;
  if (typeof treatment !== "string" || !isTreatmentSupported(treatment)) return null;

  const ratePercentRaw = value.ratePercent;
  let ratePercent: number | null = null;
  if (ratePercentRaw != null) {
    if (typeof ratePercentRaw !== "number" || !Number.isFinite(ratePercentRaw)) return null;
    ratePercent = ratePercentRaw;
  }

  const label = typeof value.label === "string" && value.label.trim() ? value.label : "Product/service taxability";
  return { treatment: treatment as TreatmentCode, ratePercent, label };
}

export async function getEffectiveUsProductTaxabilityRule(
  stateCode: string,
  category: UsProductTaxCategory,
  asOf?: string,
): Promise<ResolvedUsProductTaxabilityRule | null> {
  const rule = await getEffectiveTaxRule(usProductTaxabilityRule(stateCode, category), asOf);
  if (!rule) return null;
  const parsed = parseUsProductTaxabilityRuleValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
