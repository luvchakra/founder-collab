import type { CaGstHstTaxDetermination, ResolvedGstHstRateRule, ResolvedProvincialSalesTaxRule } from "./types";

/**
 * COMPLY-P1-03.1/03.2: the pure combiner tying a province's own GST/HST rate together with
 * its own separate provincial sales tax rate (when one exists) into one total. DB-
 * independent and unit-tested standalone, matching this module's own "pure logic separated
 * from its DB-touching caller" convention.
 *
 * For an `hst` province, `provincialRatePercent` is always `null` -- the provincial
 * component is already baked into `gstRatePercent` as one harmonized number, not a second
 * figure to add. For a `gst_pst` province, the two are genuinely separate taxes
 * administered by different authorities, so `totalRatePercent` is their sum (what a
 * customer actually pays, even though it is remitted to two different governments via two
 * different returns). For a `gst_only` jurisdiction, `provincialRatePercent` is `null` and
 * `totalRatePercent` equals the plain 5% GST.
 */
export function determineCaGstHstTax(gstHstRule: ResolvedGstHstRateRule, provincialRule: ResolvedProvincialSalesTaxRule | null): CaGstHstTaxDetermination {
  const ruleRefs = [gstHstRule.rule.id];
  let provincialRatePercent: number | null = null;
  let totalRatePercent = gstHstRule.ratePercent;

  if (gstHstRule.taxModel === "gst_pst" && provincialRule) {
    provincialRatePercent = provincialRule.ratePercent;
    totalRatePercent = gstHstRule.ratePercent + provincialRule.ratePercent;
    ruleRefs.push(provincialRule.rule.id);
  }

  return {
    province: gstHstRule.rule.jurisdiction ?? "",
    taxModel: gstHstRule.taxModel,
    gstRatePercent: gstHstRule.ratePercent,
    provincialRatePercent,
    totalRatePercent,
    ruleRefs,
  };
}
