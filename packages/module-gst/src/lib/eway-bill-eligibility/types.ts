import type { TaxRule } from "../tax-rules/types";

/**
 * COMPLY-P0-06.1 (E-Way Bill Eligibility Engine): "Determine whether e-way bill applies."
 * The result of comparing one document's own consignment value against the versioned
 * threshold rule in effect on a given date -- NEVER a claim that a movement of goods "is"
 * or "is not" e-way-bill compliant (backlog rule 11), only whether the OBLIGATION appears
 * to apply given the inputs at hand. Same shape/discipline as
 * COMPLY-P0-05.1's own `EinvoiceEligibilityResult`.
 */
export type EwayBillEligibilityResult = {
  /** `null` only when there wasn't enough information to answer at all (no threshold rule
   * resolved for the date, or no consignment value available) -- never defaulted to
   * `false` just because a fact was missing. */
  required: boolean | null;
  reason: string;
  thresholdInr: number | null;
  /** The full versioned rule row this determination was made under, for traceability
   * (backlog rule 14) -- `null` when no rule version covers the given date. */
  thresholdRule: TaxRule | null;
  consignmentValueInr: number | null;
};
