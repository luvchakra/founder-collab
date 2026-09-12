import type { TreatmentCode } from "../compliance/treatments";
import type { TaxRule } from "../tax-rules/types";

/**
 * COMPLY-P1-02.5 (United States -- Product/Service Taxability): "which item/service
 * categories are taxable, exempt, or reduced-rate per state." A small, closed, US-specific
 * vocabulary -- unlike India GST/EU VAT (which classify almost everything via a single
 * HSN/SAC or CN code lookup), US sales tax carve-outs are named by everyday product
 * CATEGORY (clothing, groceries, ...), not a numeric commodity code, which is why this
 * lives in its own `lib/us-product-taxability/` folder rather than trying to force it into
 * `lib/inventory-tax-context/hsn-sac.ts`'s own HSN/SAC-shaped validator.
 */
export type UsProductTaxCategory =
  | "general"
  | "clothing"
  | "groceries"
  | "prepared_food"
  | "digital_goods"
  | "saas"
  | "services";

export type UsProductTaxCategoryCatalogEntry = {
  code: UsProductTaxCategory;
  name: string;
  /** Plain-language explanation of the classification -- a software *rule* describing what
   * the category means, never a claim about any specific state's law (backlog rule 12).
   * The actual per-state treatment lives in a versioned `gst.tax_rules` row, cited by its
   * own `source`. */
  description: string;
  /**
   * Whether "no state-specific rule found" is safe to resolve as "taxed like general
   * tangible personal property" (true for every real-world GOODS category -- US sales tax
   * statutes tax tangible personal property by default unless a specific carve-out
   * exists) or must stay unresolved (false for `saas`/`services` -- whether a state taxes
   * services/SaaS at all varies unpredictably state-by-state, with no safe universal
   * default; guessing either way here risks under- OR over-stating a real obligation,
   * backlog rule 11).
   */
  defaultsToGeneralRate: boolean;
};

export type UsProductTaxabilityDetermination = {
  /** `null` only for an `expense`-kind item -- see `notApplicable` below. */
  category: UsProductTaxCategory | null;
  /** `true` for an item that is never itself sold/invoiced (an internal expense line) --
   * product taxability is a non-question for it, distinct from `resolved: false` (a real
   * question this platform simply has no rule to answer yet). */
  notApplicable: boolean;
  /** `false` when this platform has no way to answer for this category/state combination
   * -- never a guessed `true`/`false` treatment (backlog rule 11). */
  resolved: boolean;
  treatment: TreatmentCode | null;
  /** `0` for an exempt treatment, the effective ad-valorem rate otherwise, `null` when
   * unresolved. */
  ratePercent: number | null;
  /** `gst.tax_rules.id` values this determination cites -- the same traceability
   * convention `gst.tax_determinations.rule_refs` (COMPLY-P0-02.5) already established. */
  ruleRefs: string[];
  reason: string;
};

export type UsProductTaxabilityRuleValue = {
  treatment: TreatmentCode;
  /** `null` only ever appears when `treatment === "standard"` and the rule's own author
   * intends the general state rate to apply (kept for completeness; this session's own
   * seed always gives an explicit `exempt`/`reduced` row a rate of `0`/its reduced value). */
  ratePercent: number | null;
  label: string;
};

export type ResolvedUsProductTaxabilityRule = UsProductTaxabilityRuleValue & { rule: TaxRule };
