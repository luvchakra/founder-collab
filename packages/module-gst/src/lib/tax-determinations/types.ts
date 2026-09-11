/** `gst.tax_determinations` row shape -- see that migration's own docstring for why it
 * is immutable (no update/delete) and tenant-scoped (unlike `gst.tax_rules`, this is the
 * result of taxing one specific business's own transaction). */
export type TaxDetermination = {
  id: string;
  business_id: string;
  source_module: string;
  source_reference: string;
  country: string;
  jurisdiction: string | null;
  regime: string;
  treatment: string | null;
  taxable_amount: number;
  tax_amount: number;
  /** `gst.tax_rules.id` values applied to produce this result -- may be empty (e.g. an
   * out-of-scope result with nothing to cite). */
  rule_refs: string[];
  computed_at: string;
  created_at: string;
};

export type TaxDeterminationInput = {
  country: string;
  jurisdiction: string | null;
  regime: string;
  treatment?: string | null;
  sourceModule: string;
  sourceReference: string;
  taxableAmount: number;
  taxAmount: number;
  ruleRefs?: string[];
};
