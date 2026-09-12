import type { CaTaxModel } from "../compliance/ca-provinces";
import type { TaxRule } from "../tax-rules/types";

/**
 * COMPLY-P1-03 (Canada -- GST/HST, Provincial PST/QST/RST, Place of Supply, Filing
 * Periods, CRA Filing Adapter). See `lib/compliance/ca-provinces.ts`'s own docstring for
 * the three tax models this file's own types reference throughout.
 */

export const CA_GST_HST_REGIME = "GST_HST";

export type GstHstRateRuleValue = { ratePercent: number; taxModel: CaTaxModel; label: string };
export type ProvincialSalesTaxRuleValue = { ratePercent: number; taxLabel: string; label: string };
export type SmallSupplierThresholdRuleValue = { thresholdCad: number; label: string };
export type FilingFrequencyThresholdRuleValue = { annualThresholdCad: number; quarterlyThresholdCad: number; label: string };

export type ResolvedGstHstRateRule = GstHstRateRuleValue & { rule: TaxRule };
export type ResolvedProvincialSalesTaxRule = ProvincialSalesTaxRuleValue & { rule: TaxRule };
export type ResolvedSmallSupplierThresholdRule = SmallSupplierThresholdRuleValue & { rule: TaxRule };
export type ResolvedFilingFrequencyThresholdRule = FilingFrequencyThresholdRuleValue & { rule: TaxRule };

export type CaPlaceOfSupply = { province: string | null; treatment: "domestic" | "export" | "unknown" };

export type GstHstFilingFrequency = "annual" | "quarterly" | "monthly";

export type CaGstHstTaxDetermination = {
  province: string;
  taxModel: CaTaxModel;
  gstRatePercent: number;
  provincialRatePercent: number | null;
  totalRatePercent: number;
  ruleRefs: string[];
};
