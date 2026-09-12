import type { TaxRule } from "../tax-rules/types";
import type { EinvoiceEligibilityResult, TurnoverSource } from "./types";

/**
 * COMPLY-P0-05.1 (E-Invoice Eligibility): the pure comparison at the center of this story
 * -- every fact it needs (a turnover figure and its source, the currently-effective
 * threshold and its own rule row, an optional caller-declared "ever crossed before" fact,
 * and the business's self-declared flag) is resolved by the caller (`queries.ts`'s own
 * orchestrator) and passed in, so this stays testable without a live database connection,
 * matching this module's established convention.
 *
 * `everCrossedThresholdHistorically` models a real GST rule this function would otherwise
 * get wrong: aggregate turnover is tested against every financial year since 2017-18, not
 * just the current one -- once a business crosses the threshold in ANY year, e-invoicing
 * stays mandatory even if turnover later falls back below it. This platform has no
 * financial-year turnover ledger to derive that fact from, so it is caller-DECLARED
 * (backlog rule 12, "self-declared, not computed" -- the same posture COMPLY-P0-04.2's own
 * `eInvoiceEligible` flag takes), never inferred from the current turnover figure alone.
 * When `true`, it wins outright regardless of what the current threshold/turnover
 * comparison would otherwise say.
 */
export function determineEinvoiceEligibility(input: {
  turnoverInr: number | null;
  turnoverSource: TurnoverSource;
  thresholdInr: number | null;
  thresholdRule: TaxRule | null;
  everCrossedThresholdHistorically?: boolean;
  selfDeclaredEligible: boolean | null;
}): EinvoiceEligibilityResult {
  const base = {
    thresholdInr: input.thresholdInr,
    thresholdRule: input.thresholdRule,
    turnoverInr: input.turnoverInr,
    turnoverSource: input.turnoverSource,
    selfDeclaredEligible: input.selfDeclaredEligible,
  };

  if (input.everCrossedThresholdHistorically) {
    return {
      ...base,
      mandated: true,
      reason:
        "This business has declared that its aggregate turnover exceeded the e-invoice threshold in an earlier financial year -- under GST rules, e-invoicing stays mandatory even if turnover has since fallen below the current threshold.",
    };
  }

  if (input.thresholdInr === null) {
    return {
      ...base,
      mandated: null,
      reason: "No e-invoice turnover threshold rule could be resolved for this date.",
    };
  }

  if (input.turnoverInr === null) {
    return {
      ...base,
      mandated: null,
      reason: "No aggregate turnover figure is available to compare against the threshold.",
    };
  }

  const mandated = input.turnoverInr > input.thresholdInr;
  const turnoverLabel = `₹${input.turnoverInr.toLocaleString("en-IN")}`;
  const thresholdLabel = `₹${input.thresholdInr.toLocaleString("en-IN")}`;
  return {
    ...base,
    mandated,
    reason: mandated
      ? `Turnover (${turnoverLabel}) exceeds the ${thresholdLabel} e-invoice threshold currently in effect.`
      : `Turnover (${turnoverLabel}) is at or below the ${thresholdLabel} e-invoice threshold currently in effect.`,
  };
}
