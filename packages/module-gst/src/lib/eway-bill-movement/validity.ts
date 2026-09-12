import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";
import type { VehicleType } from "./types";

/**
 * COMPLY-P0-06.2 (Movement Data): the "distance" half of this story -- the km-per-day
 * rule Rule 138(10) of the CGST Rules bases an e-way bill's own validity PERIOD on. Seeded
 * by `20260912070000_gst_tax_rules_eway_bill_validity_seed.sql` (two versions -- 100
 * km/day non-ODC before 01-Jan-2021, 200 km/day from then on; ODC's own 20 km/day is
 * unchanged across both versions -- see that migration's own comment for full sourcing).
 * Same "export the lineage as a constant" convention `EWAY_BILL_THRESHOLD_RULE`
 * (COMPLY-P0-06.1) already established.
 *
 * This module computes VALIDITY, a fact about how long an e-way bill remains usable once
 * generated -- it does NOT decide whether one is required at all (that is
 * `eway-bill-eligibility`'s own job) or generate one (COMPLY-P0-06.3's own adapter).
 */
export const EWAY_BILL_VALIDITY_RULE: TaxRuleLineage = {
  country: "IN",
  regime: "GST",
  jurisdiction: null,
  ruleKey: "eway_bill_validity_km_per_day",
};

export type EwayBillValidityRuleValue = {
  normalKmPerDay: number;
  odcKmPerDay: number;
  label: string;
};

/** Defensive parse of `gst.tax_rules.value` for this specific rule_key -- same posture
 * every prior rule-value parser in this module already established
 * (`parseEinvoiceThresholdValue`, `parseEwayBillThresholdValue`). Returns `null` for
 * anything malformed. */
export function parseEwayBillValidityValue(value: Record<string, unknown>): EwayBillValidityRuleValue | null {
  const normalKmPerDay = value.normalKmPerDay;
  const odcKmPerDay = value.odcKmPerDay;
  if (typeof normalKmPerDay !== "number" || !Number.isFinite(normalKmPerDay) || normalKmPerDay <= 0) return null;
  if (typeof odcKmPerDay !== "number" || !Number.isFinite(odcKmPerDay) || odcKmPerDay <= 0) return null;

  const label = typeof value.label === "string" && value.label.trim() ? value.label : "E-Way Bill validity distance rule";
  return { normalKmPerDay, odcKmPerDay, label };
}

/** The km-per-day validity rule in effect as of `asOf` (defaults to today) -- `null` when
 * no version covers that date or the stored value doesn't parse. Never guesses a
 * fallback figure. */
export async function getEffectiveEwayBillValidityRule(
  asOf?: string,
): Promise<(EwayBillValidityRuleValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(EWAY_BILL_VALIDITY_RULE, asOf);
  if (!rule) return null;
  const parsed = parseEwayBillValidityValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

export type EwayBillValidityResult = {
  /** `null` only when there wasn't enough information to compute a validity period (no
   * rule resolved for the date, or no distance available) -- never defaulted to any
   * particular number of days (backlog rule 11). */
  validityDays: number | null;
  reason: string;
  distanceKm: number | null;
  kmPerDay: number | null;
  rule: TaxRule | null;
};

/**
 * Pure: Rule 138(10)'s own formula -- one day of validity for the first `kmPerDay`
 * kilometers (or any part of that band), plus one additional day for every further
 * `kmPerDay` km or part thereof. `vehicleType` selects which of the rule's own two
 * figures applies (ODC uses its own, much shorter, per-day distance). Every fact this
 * needs is resolved by the caller (`queries.ts`'s own orchestrator), matching this
 * module's established "pure core function, thin orchestrator" convention.
 *
 * Deliberately does NOT model the separate "movement within 50 km in the same state does
 * not require Part-B (transporter/vehicle) details" provision -- a different sub-rule
 * about which FIELDS are mandatory, not about validity duration, and one this session's
 * own research could not pin down with the same sourcing confidence as the km-per-day
 * figures above. Flagged as a documented gap for whichever future story (most naturally
 * COMPLY-P0-06.3's own adapter, which must decide what's mandatory before submission) adds
 * it with a real citation.
 */
export function computeEwayBillValidityDays(input: {
  distanceKm: number | null;
  vehicleType: VehicleType;
  rule: (EwayBillValidityRuleValue & { rule: TaxRule }) | null;
}): EwayBillValidityResult {
  const base = { distanceKm: input.distanceKm, rule: input.rule?.rule ?? null };

  if (!input.rule) {
    return { ...base, validityDays: null, kmPerDay: null, reason: "No e-way bill validity rule could be resolved for this date." };
  }
  if (input.distanceKm === null) {
    return { ...base, validityDays: null, kmPerDay: null, reason: "No distance is available to compute a validity period." };
  }

  const kmPerDay = input.vehicleType === "over_dimensional_cargo" ? input.rule.odcKmPerDay : input.rule.normalKmPerDay;
  const validityDays = input.distanceKm <= 0 ? 1 : Math.ceil(input.distanceKm / kmPerDay);

  return {
    ...base,
    kmPerDay,
    validityDays,
    reason: `${validityDays} day${validityDays === 1 ? "" : "s"} of validity for ${input.distanceKm} km at ${kmPerDay} km/day (${
      input.vehicleType === "over_dimensional_cargo" ? "Over Dimensional Cargo" : "regular cargo"
    }).`,
  };
}
