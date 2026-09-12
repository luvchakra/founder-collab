import { getUsProductTaxCategory } from "./categories";
import type { ResolvedUsProductTaxabilityRule, UsProductTaxCategory, UsProductTaxabilityDetermination } from "./types";

/**
 * COMPLY-P1-02.5: the pure combiner -- given an (already-fetched) category-specific
 * override rule and the state's own general sales tax rate rule, decide the effective
 * treatment/rate for one category. DB-independent and unit-tested standalone, the same
 * "pure logic separated from its DB-touching caller" convention every prior determination
 * in this module follows (`determineEconomicNexus`, `determineRegistrationObligation`,
 * `determinePlaceOfSupply`).
 *
 * Never guesses in the risky direction (backlog rule 11): a category-specific rule, when
 * one exists, always wins outright. Absent one, a GOODS-like category (`defaultsToGeneralRate:
 * true` -- general/clothing/groceries/prepared_food/digital_goods) falls back to "taxed like
 * general tangible personal property," a safe default because US sales tax statutes tax TPP
 * by default unless a specific carve-out exists. A SERVICE-like category (`saas`/`services`)
 * never falls back that way -- whether a state taxes services/SaaS at all varies
 * unpredictably, so "unresolved" is the only honest answer with no override rule on file.
 */
export function determineUsProductTaxability(params: {
  category: UsProductTaxCategory;
  categoryRule: ResolvedUsProductTaxabilityRule | null;
  generalRule: { ratePercent: number; rule: { id: string } } | null;
}): UsProductTaxabilityDetermination {
  const { category, categoryRule, generalRule } = params;

  if (categoryRule) {
    const ratePercent = categoryRule.treatment === "exempt" ? 0 : (categoryRule.ratePercent ?? generalRule?.ratePercent ?? null);
    const ruleRefs = [categoryRule.rule.id];
    if (categoryRule.treatment === "standard" && categoryRule.ratePercent == null && generalRule) ruleRefs.push(generalRule.rule.id);
    return {
      category,
      notApplicable: false,
      resolved: ratePercent != null,
      treatment: categoryRule.treatment,
      ratePercent,
      ruleRefs,
      reason:
        ratePercent != null
          ? `State-specific ${category} taxability rule on file: ${categoryRule.label}.`
          : `A ${category} taxability rule exists but names no rate, and no general state rate is on file to fall back to.`,
    };
  }

  const catalogEntry = getUsProductTaxCategory(category);
  if (catalogEntry?.defaultsToGeneralRate) {
    if (generalRule) {
      return {
        category,
        notApplicable: false,
        resolved: true,
        treatment: "standard",
        ratePercent: generalRule.ratePercent,
        ruleRefs: [generalRule.rule.id],
        reason: `No ${category}-specific override on file for this state; defaults to the general state sales tax rate.`,
      };
    }
    return {
      category,
      notApplicable: false,
      resolved: false,
      treatment: null,
      ratePercent: null,
      ruleRefs: [],
      reason: "No general state sales tax rate on file for this state.",
    };
  }

  return {
    category,
    notApplicable: false,
    resolved: false,
    treatment: null,
    ratePercent: null,
    ruleRefs: [],
    reason: `No state-specific ${category} taxability rule on file -- this category has no safe universal default, so it is never assumed taxable or exempt.`,
  };
}
