import { getEffectiveTaxRule, type TaxRuleLineage } from "./queries";
import type { TaxRule } from "./types";

/**
 * COMPLY-P1-02.1/02.2 (United States -- State/Local Jurisdictions / Economic Nexus
 * Tracker): rate + economic-nexus-threshold lookups for the backlog's own initial 10-state
 * focus list, reading the versioned rows
 * `20260912270000_gst_tax_rules_us_sales_tax_seed.sql` published. Generic across ANY US
 * state by construction (state code is a parameter, same "one generic engine, country/
 * jurisdiction packs are just rows" shape `eu-vat-rates.ts` already established for the EU)
 * -- adding an 11th state needs only more rows, no code change here.
 */

export const US_SALES_TAX_REGIME = "SALES_TAX";

export function usStateSalesTaxRateRule(stateCode: string): TaxRuleLineage {
  return { country: "US", jurisdiction: stateCode, regime: US_SALES_TAX_REGIME, ruleKey: "state_sales_tax_rate" };
}

export function usEconomicNexusThresholdRule(stateCode: string): TaxRuleLineage {
  return { country: "US", jurisdiction: stateCode, regime: US_SALES_TAX_REGIME, ruleKey: "economic_nexus_threshold" };
}

export type UsStateSalesTaxRateValue = { ratePercent: number; label: string };

export type UsEconomicNexusThresholdLogic = "revenue_only" | "revenue_or_transactions" | "revenue_and_transactions";

export type UsEconomicNexusThresholdValue = {
  revenueThresholdUsd: number;
  /** `null` when `thresholdLogic` is `"revenue_only"` -- there is no transaction-count
   * prong at all for that state, not merely an unset number. */
  transactionThreshold: number | null;
  thresholdLogic: UsEconomicNexusThresholdLogic;
  label: string;
};

/** Same defensive-parse-never-throw posture as `parseEuVatStandardRateValue`. */
export function parseUsStateSalesTaxRateValue(value: Record<string, unknown>): UsStateSalesTaxRateValue | null {
  const ratePercent = value.ratePercent;
  if (typeof ratePercent !== "number" || !Number.isFinite(ratePercent)) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "State sales tax rate";
  return { ratePercent, label };
}

const THRESHOLD_LOGICS: readonly UsEconomicNexusThresholdLogic[] = ["revenue_only", "revenue_or_transactions", "revenue_and_transactions"];

export function parseUsEconomicNexusThresholdValue(value: Record<string, unknown>): UsEconomicNexusThresholdValue | null {
  const revenueThresholdUsd = value.revenueThresholdUsd;
  if (typeof revenueThresholdUsd !== "number" || !Number.isFinite(revenueThresholdUsd)) return null;

  const thresholdLogic = value.thresholdLogic;
  if (typeof thresholdLogic !== "string" || !THRESHOLD_LOGICS.includes(thresholdLogic as UsEconomicNexusThresholdLogic)) return null;

  const transactionThresholdRaw = value.transactionThreshold;
  let transactionThreshold: number | null = null;
  if (transactionThresholdRaw != null) {
    if (typeof transactionThresholdRaw !== "number" || !Number.isFinite(transactionThresholdRaw)) return null;
    transactionThreshold = transactionThresholdRaw;
  }
  // A revenue_only rule with a transaction threshold given (or vice versa for the other
  // logics missing one) would be an internally-inconsistent row -- refuse to parse rather
  // than silently picking one field to trust over the other.
  if (thresholdLogic === "revenue_only" && transactionThreshold != null) return null;
  if (thresholdLogic !== "revenue_only" && transactionThreshold == null) return null;

  const label = typeof value.label === "string" && value.label.trim() ? value.label : "Economic nexus threshold";
  return { revenueThresholdUsd, transactionThreshold, thresholdLogic: thresholdLogic as UsEconomicNexusThresholdLogic, label };
}

export async function getEffectiveUsStateSalesTaxRate(
  stateCode: string,
  asOf?: string,
): Promise<(UsStateSalesTaxRateValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(usStateSalesTaxRateRule(stateCode), asOf);
  if (!rule) return null;
  const parsed = parseUsStateSalesTaxRateValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

export async function getEffectiveUsEconomicNexusThreshold(
  stateCode: string,
  asOf?: string,
): Promise<(UsEconomicNexusThresholdValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(usEconomicNexusThresholdRule(stateCode), asOf);
  if (!rule) return null;
  const parsed = parseUsEconomicNexusThresholdValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
