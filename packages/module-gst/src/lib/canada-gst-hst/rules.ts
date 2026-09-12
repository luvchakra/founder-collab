import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import {
  CA_GST_HST_REGIME,
  type FilingFrequencyThresholdRuleValue,
  type GstHstRateRuleValue,
  type ProvincialSalesTaxRuleValue,
  type ResolvedFilingFrequencyThresholdRule,
  type ResolvedGstHstRateRule,
  type ResolvedProvincialSalesTaxRule,
  type ResolvedSmallSupplierThresholdRule,
  type SmallSupplierThresholdRuleValue,
} from "./types";
import type { CaTaxModel } from "../compliance/ca-provinces";

/** COMPLY-P1-03.1/03.2/03.4: versioned lookups over the same `gst.tax_rules` engine
 * (COMPLY-P0-02.3) every other country pack in this module already uses. */

const TAX_MODELS: readonly CaTaxModel[] = ["hst", "gst_pst", "gst_only"];

export function gstHstRateRule(province: string): TaxRuleLineage {
  return { country: "CA", jurisdiction: province, regime: CA_GST_HST_REGIME, ruleKey: "gst_hst_rate" };
}

export function provincialSalesTaxRule(province: string): TaxRuleLineage {
  return { country: "CA", jurisdiction: province, regime: CA_GST_HST_REGIME, ruleKey: "provincial_sales_tax_rate" };
}

export function smallSupplierThresholdRule(): TaxRuleLineage {
  return { country: "CA", jurisdiction: null, regime: CA_GST_HST_REGIME, ruleKey: "small_supplier_threshold_cad" };
}

export function filingFrequencyThresholdRule(): TaxRuleLineage {
  return { country: "CA", jurisdiction: null, regime: CA_GST_HST_REGIME, ruleKey: "gst_hst_filing_frequency_threshold_cad" };
}

export function parseGstHstRateValue(value: Record<string, unknown>): GstHstRateRuleValue | null {
  const ratePercent = value.ratePercent;
  if (typeof ratePercent !== "number" || !Number.isFinite(ratePercent)) return null;
  const taxModel = value.taxModel;
  if (typeof taxModel !== "string" || !TAX_MODELS.includes(taxModel as CaTaxModel)) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "GST/HST rate";
  return { ratePercent, taxModel: taxModel as CaTaxModel, label };
}

export function parseProvincialSalesTaxValue(value: Record<string, unknown>): ProvincialSalesTaxRuleValue | null {
  const ratePercent = value.ratePercent;
  if (typeof ratePercent !== "number" || !Number.isFinite(ratePercent)) return null;
  const taxLabel = typeof value.taxLabel === "string" && value.taxLabel.trim() ? value.taxLabel : "PST";
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "Provincial sales tax rate";
  return { ratePercent, taxLabel, label };
}

export function parseSmallSupplierThresholdValue(value: Record<string, unknown>): SmallSupplierThresholdRuleValue | null {
  const thresholdCad = value.thresholdCad;
  if (typeof thresholdCad !== "number" || !Number.isFinite(thresholdCad)) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "GST/HST small-supplier threshold";
  return { thresholdCad, label };
}

export function parseFilingFrequencyThresholdValue(value: Record<string, unknown>): FilingFrequencyThresholdRuleValue | null {
  const annualThresholdCad = value.annualThresholdCad;
  const quarterlyThresholdCad = value.quarterlyThresholdCad;
  if (typeof annualThresholdCad !== "number" || !Number.isFinite(annualThresholdCad)) return null;
  if (typeof quarterlyThresholdCad !== "number" || !Number.isFinite(quarterlyThresholdCad)) return null;
  if (quarterlyThresholdCad <= annualThresholdCad) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "GST/HST filing frequency thresholds";
  return { annualThresholdCad, quarterlyThresholdCad, label };
}

export async function getEffectiveGstHstRate(province: string, asOf?: string): Promise<ResolvedGstHstRateRule | null> {
  const rule = await getEffectiveTaxRule(gstHstRateRule(province), asOf);
  if (!rule) return null;
  const parsed = parseGstHstRateValue(rule.value);
  return parsed ? { ...parsed, rule } : null;
}

export async function getEffectiveProvincialSalesTax(province: string, asOf?: string): Promise<ResolvedProvincialSalesTaxRule | null> {
  const rule = await getEffectiveTaxRule(provincialSalesTaxRule(province), asOf);
  if (!rule) return null;
  const parsed = parseProvincialSalesTaxValue(rule.value);
  return parsed ? { ...parsed, rule } : null;
}

export async function getEffectiveSmallSupplierThreshold(asOf?: string): Promise<ResolvedSmallSupplierThresholdRule | null> {
  const rule = await getEffectiveTaxRule(smallSupplierThresholdRule(), asOf);
  if (!rule) return null;
  const parsed = parseSmallSupplierThresholdValue(rule.value);
  return parsed ? { ...parsed, rule } : null;
}

export async function getEffectiveFilingFrequencyThreshold(asOf?: string): Promise<ResolvedFilingFrequencyThresholdRule | null> {
  const rule = await getEffectiveTaxRule(filingFrequencyThresholdRule(), asOf);
  if (!rule) return null;
  const parsed = parseFilingFrequencyThresholdValue(rule.value);
  return parsed ? { ...parsed, rule } : null;
}
