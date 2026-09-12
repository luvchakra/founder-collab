import { getEffectiveTaxRule, type TaxRuleLineage } from "./queries";
import type { TaxRule } from "./types";

/**
 * COMPLY-P1-01.2 (Member State Country Packs): rate lookups for the backlog's own initial
 * EU focus list (Germany/France/Belgium/Poland/Italy), reading the versioned rows
 * `20260912240000_gst_tax_rules_eu_vat_rates_seed.sql` published. Generic across all five
 * (and any future EU member-state pack) by construction -- unlike India's own
 * `india-rate-slabs.ts` (a single fixed lineage, since India has exactly one regime), every
 * function here takes `country` as a parameter, matching this module's own "one generic
 * engine, country packs are just rows" architecture (this session's own most-repeated
 * instruction).
 */

export const EU_VAT_REGIME = "VAT";

export function euVatStandardRateRule(country: string): TaxRuleLineage {
  return { country, jurisdiction: null, regime: EU_VAT_REGIME, ruleKey: "vat_standard_rate" };
}

export function euVatReducedRatesRule(country: string): TaxRuleLineage {
  return { country, jurisdiction: null, regime: EU_VAT_REGIME, ruleKey: "vat_reduced_rates" };
}

export type EuVatStandardRateValue = { ratePercent: number; label: string };
export type EuVatReducedRateEntry = { ratePercent: number; label: string };
export type EuVatReducedRatesValue = { rates: EuVatReducedRateEntry[]; label: string };

/** Same defensive-parse-never-throw posture as `parseRateSlabValue` -- `gst.tax_rules.value`
 * is opaque jsonb at the table level, so a caller reading it back must not assume its shape. */
export function parseEuVatStandardRateValue(value: Record<string, unknown>): EuVatStandardRateValue | null {
  const ratePercent = value.ratePercent;
  if (typeof ratePercent !== "number" || !Number.isFinite(ratePercent)) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "Standard VAT rate";
  return { ratePercent, label };
}

export function parseEuVatReducedRatesValue(value: Record<string, unknown>): EuVatReducedRatesValue | null {
  const ratesRaw = value.rates;
  if (!Array.isArray(ratesRaw) || ratesRaw.length === 0) return null;

  const rates: EuVatReducedRateEntry[] = [];
  for (const entry of ratesRaw) {
    if (!entry || typeof entry !== "object") return null;
    const ratePercent = (entry as Record<string, unknown>).ratePercent;
    if (typeof ratePercent !== "number" || !Number.isFinite(ratePercent)) return null;
    const entryLabel = (entry as Record<string, unknown>).label;
    rates.push({ ratePercent, label: typeof entryLabel === "string" && entryLabel.trim() ? entryLabel : "Reduced VAT rate" });
  }

  const label = typeof value.label === "string" && value.label.trim() ? value.label : "Reduced VAT rates";
  return { rates, label };
}

/** The standard VAT rate for `country` in effect as of `asOf` (defaults to today), or
 * `null` when no version covers that date or the stored value doesn't parse -- never
 * guesses a fallback rate, the same posture `getEffectiveIndiaGstRateSlabs` already
 * established. */
export async function getEffectiveEuVatStandardRate(
  country: string,
  asOf?: string,
): Promise<(EuVatStandardRateValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(euVatStandardRateRule(country), asOf);
  if (!rule) return null;
  const parsed = parseEuVatStandardRateValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

/** The reduced VAT rate(s) for `country` in effect as of `asOf`, or `null` when no version
 * covers that date, the stored value doesn't parse, or (Poland's own case) the country
 * simply has no reduced-rate rule published yet. */
export async function getEffectiveEuVatReducedRates(
  country: string,
  asOf?: string,
): Promise<(EuVatReducedRatesValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(euVatReducedRatesRule(country), asOf);
  if (!rule) return null;
  const parsed = parseEuVatReducedRatesValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
