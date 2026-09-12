import type { TaxRule } from "../tax-rules/types";
import type { EwayBillEligibilityResult } from "./types";

/**
 * COMPLY-P0-06.1 (E-Way Bill Eligibility Engine): the pure comparison at the center of this
 * story -- every fact it needs (a consignment value, and the currently-effective threshold
 * and its own rule row) is resolved by the caller (`queries.ts`'s own orchestrator), matching
 * this module's established "pure core function, thin orchestrator" convention.
 *
 * The threshold test is strict `>` ("exceeds fifty thousand rupees" per Rule 138(1)'s own
 * real wording) -- deliberately the SAME comparison COMPLY-P0-05.1's own e-invoice mandate
 * threshold uses, and deliberately DIFFERENT from COMPLY-P0-05.5's own `>=` reporting-window
 * threshold ("AATO of ₹10 crore OR MORE") -- two different real GST rules, two different
 * real comparisons, each preserved exactly as its own source states rather than smoothed
 * into one shared convention.
 *
 * Deliberately does NOT model: goods-category exemptions (Rule 138(14)'s own list --
 * exempted goods, non-motorized conveyance, empty cargo containers, specified short-distance
 * movements, etc.), the reverse cases where an e-way bill is required regardless of value
 * (e.g. inter-state movement of handicraft goods by certain exempted persons, or goods sent
 * for job work), or state-specific intra-state threshold overrides (flagged in this rule's
 * own seed migration comment) -- all real GST nuances, all out of this story's scope, which
 * is the baseline consignment-value comparison only.
 */
export function determineEwayBillEligibility(input: {
  consignmentValueInr: number | null;
  thresholdInr: number | null;
  thresholdRule: TaxRule | null;
}): EwayBillEligibilityResult {
  const base = { thresholdInr: input.thresholdInr, thresholdRule: input.thresholdRule, consignmentValueInr: input.consignmentValueInr };

  if (input.thresholdInr === null) {
    return { ...base, required: null, reason: "No e-way bill consignment-value threshold rule could be resolved for this date." };
  }

  if (input.consignmentValueInr === null) {
    return { ...base, required: null, reason: "No consignment value is available to compare against the threshold." };
  }

  const required = input.consignmentValueInr > input.thresholdInr;
  const valueLabel = `₹${input.consignmentValueInr.toLocaleString("en-IN")}`;
  const thresholdLabel = `₹${input.thresholdInr.toLocaleString("en-IN")}`;
  return {
    ...base,
    required,
    reason: required
      ? `Consignment value (${valueLabel}) exceeds the ${thresholdLabel} e-way bill threshold currently in effect.`
      : `Consignment value (${valueLabel}) is at or below the ${thresholdLabel} e-way bill threshold currently in effect.`,
  };
}
