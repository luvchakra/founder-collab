import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";
import type { GstRecordRetentionRuleValue } from "./types";

/**
 * COMPLY-P0-10.5 (Retention Rules): the lineage identifier for the versioned GST record
 * retention rule (Section 36 of the CGST Act, 2017 -- see the seed migration's own
 * comment for full sourcing). Same "resolve the currently-effective rule, never guess a
 * fallback" convention as `einvoice-reporting-window/rule.ts`'s own
 * `getEffectiveEinvoiceReportingWindow`.
 */
export const GST_RECORD_RETENTION_RULE: TaxRuleLineage = {
  country: "IN",
  regime: "GST",
  jurisdiction: null,
  ruleKey: "gst_record_retention_months",
};

/** Defensive parse of `gst.tax_rules.value` for this specific rule_key -- same "opaque
 * jsonb, never assume its shape" posture every other `parse*Value` function in this
 * module already established. Returns `null` for anything malformed. */
export function parseGstRecordRetentionValue(value: Record<string, unknown>): GstRecordRetentionRuleValue | null {
  const months = value.months;
  const basis = value.basis;
  if (typeof months !== "number" || !Number.isFinite(months) || months <= 0) return null;
  if (basis !== "annual_return_due_date") return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "GST record retention";
  return { months, basis, label };
}

export async function getEffectiveGstRecordRetentionRule(asOf?: string): Promise<(GstRecordRetentionRuleValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(GST_RECORD_RETENTION_RULE, asOf);
  if (!rule) return null;
  const parsed = parseGstRecordRetentionValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
