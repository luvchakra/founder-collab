/** `gst.tax_rules` row shape -- see that migration's own docstring for the versioning
 * model (a "rule lineage" is identified by country/regime/jurisdiction/rule_key; each
 * version is a separate, never-mutated row) and why it has no `business_id` (a tax rule
 * is a fact about a country/regime's law, not something a business owns). */
export type TaxRule = {
  id: string;
  country: string;
  jurisdiction: string | null;
  regime: string;
  rule_key: string;
  value: Record<string, unknown>;
  version: number;
  effective_from: string;
  effective_to: string | null;
  source: string;
  /** COMPLY-P0-02.4: one of `lib/compliance/treatments.ts`'s own catalog codes, or null
   * when this rule isn't about a supply's tax treatment at all (e.g. a threshold/deadline
   * rule). */
  treatment: string | null;
  created_at: string;
  updated_at: string;
};

export type TaxRuleInput = {
  country: string;
  jurisdiction: string | null;
  regime: string;
  ruleKey: string;
  value: Record<string, unknown>;
  effectiveFrom: string;
  source: string;
  treatment?: string | null;
};
