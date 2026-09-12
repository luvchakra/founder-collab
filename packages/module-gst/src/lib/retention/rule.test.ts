import { describe, expect, it } from "vitest";
import { GST_RECORD_RETENTION_RULE, SG_GST_RECORD_RETENTION_RULE, parseGstRecordRetentionValue } from "./rule";

describe("retention rule lineages", () => {
  it("India's lineage is IN/GST with no jurisdiction", () => {
    expect(GST_RECORD_RETENTION_RULE).toEqual({ country: "IN", regime: "GST", jurisdiction: null, ruleKey: "gst_record_retention_months" });
  });

  it("Singapore's lineage (COMPLY-P1-04.7) shares the SAME rule_key, scoped by country only", () => {
    expect(SG_GST_RECORD_RETENTION_RULE).toEqual({ country: "SG", regime: "GST", jurisdiction: null, ruleKey: "gst_record_retention_months" });
    expect(SG_GST_RECORD_RETENTION_RULE.ruleKey).toBe(GST_RECORD_RETENTION_RULE.ruleKey);
  });
});

describe("parseGstRecordRetentionValue", () => {
  it("parses India's own annual_return_due_date basis", () => {
    expect(parseGstRecordRetentionValue({ months: 72, basis: "annual_return_due_date" })).toEqual({
      months: 72,
      basis: "annual_return_due_date",
      label: "GST record retention",
    });
  });

  it("parses Singapore's own accounting_period_end basis (COMPLY-P1-04.7)", () => {
    expect(parseGstRecordRetentionValue({ months: 60, basis: "accounting_period_end", label: "Singapore GST record retention" })).toEqual({
      months: 60,
      basis: "accounting_period_end",
      label: "Singapore GST record retention",
    });
  });

  it("rejects an unrecognized basis", () => {
    expect(parseGstRecordRetentionValue({ months: 60, basis: "something_else" })).toBeNull();
  });

  it("rejects a missing/non-positive months value", () => {
    expect(parseGstRecordRetentionValue({ basis: "accounting_period_end" })).toBeNull();
    expect(parseGstRecordRetentionValue({ months: 0, basis: "accounting_period_end" })).toBeNull();
    expect(parseGstRecordRetentionValue({ months: -5, basis: "accounting_period_end" })).toBeNull();
  });
});
