import type { EconomicNexusInput, NexusDeterminationResult } from "./types";

/**
 * COMPLY-P1-02.2 (Economic Nexus Tracker): pure, synchronous determination of whether a
 * business has crossed a state's own economic nexus threshold (the South Dakota v.
 * Wayfair, Inc., 138 S. Ct. 2080 (2018) doctrine every state's own statute implements) --
 * the point above which a remote seller with NO physical presence in the state must still
 * register and collect that state's sales tax. Mirrors `determineEinvoiceEligibility`'s own
 * "exceed, not meet" and "never guess, return null when unknown" posture for India's
 * turnover-gated e-invoice mandate.
 *
 * Every comparison is a strict EXCEED (`>`), not "meets or exceeds" -- the same convention
 * this module's own India threshold check already uses ("must EXCEED, not meet").
 */
export function determineEconomicNexus(input: EconomicNexusInput): NexusDeterminationResult {
  const { salesUsd, transactionCount, threshold } = input;

  if (threshold.thresholdLogic === "revenue_only") {
    if (salesUsd == null) {
      return { hasNexus: null, reason: "No declared sales figure for this state -- cannot determine economic nexus." };
    }
    const exceeds = salesUsd > threshold.revenueThresholdUsd;
    return {
      hasNexus: exceeds,
      reason: exceeds
        ? `Declared sales (USD ${salesUsd}) exceed the USD ${threshold.revenueThresholdUsd} revenue-only economic nexus threshold.`
        : `Declared sales (USD ${salesUsd}) do not exceed the USD ${threshold.revenueThresholdUsd} revenue-only economic nexus threshold.`,
    };
  }

  const revenueExceeds = salesUsd == null ? null : salesUsd > threshold.revenueThresholdUsd;
  const transactionsExceed = transactionCount == null ? null : transactionCount > (threshold.transactionThreshold ?? 0);

  if (threshold.thresholdLogic === "revenue_or_transactions") {
    // Either prong alone is enough to PROVE nexus -- a known "true" on either side settles
    // it regardless of whether the other is known.
    if (revenueExceeds === true || transactionsExceed === true) {
      return { hasNexus: true, reason: `Economic nexus established: either the USD ${threshold.revenueThresholdUsd} revenue threshold or the ${threshold.transactionThreshold}-transaction threshold was exceeded (OR test).` };
    }
    // Both known and both false is the only way to PROVE no nexus for an OR test.
    if (revenueExceeds === false && transactionsExceed === false) {
      return { hasNexus: false, reason: `Neither the USD ${threshold.revenueThresholdUsd} revenue threshold nor the ${threshold.transactionThreshold}-transaction threshold was exceeded (OR test).` };
    }
    return { hasNexus: null, reason: "Cannot rule out economic nexus (OR test) -- at least one of the declared sales figure or transaction count is missing, and neither known figure alone proves or disproves nexus." };
  }

  // revenue_and_transactions (New York's own AND test): a known "false" on EITHER side
  // already proves no nexus, regardless of the other -- an AND requires both.
  if (revenueExceeds === false || transactionsExceed === false) {
    return { hasNexus: false, reason: `Economic nexus requires BOTH the USD ${threshold.revenueThresholdUsd} revenue threshold AND the ${threshold.transactionThreshold}-transaction threshold to be exceeded (AND test) -- at least one was not.` };
  }
  if (revenueExceeds === true && transactionsExceed === true) {
    return { hasNexus: true, reason: `Both the USD ${threshold.revenueThresholdUsd} revenue threshold and the ${threshold.transactionThreshold}-transaction threshold were exceeded (AND test).` };
  }
  return { hasNexus: null, reason: "Cannot confirm economic nexus (AND test) -- at least one of the declared sales figure or transaction count is missing, and the known figure alone does not disprove nexus." };
}
