import type { ResolvedSmallSupplierThresholdRule } from "./types";

export type SmallSupplierRegistrationDetermination = {
  /** `false` only when no threshold rule resolved for the given date -- otherwise this
   * always resolves to a real `true`/`false` obligated value, since the underlying test
   * (cumulative revenue vs. one threshold) has no "insufficient information" branch the
   * way a two-pronged US economic-nexus test can. */
  resolved: boolean;
  obligated: boolean | null;
  thresholdCad: number | null;
  reason: string;
  ruleRefs: string[];
};

/**
 * COMPLY-P1-03 (small-supplier registration threshold, folded into the same epic as
 * GST/HST rather than its own numbered sub-story -- the backlog's own §7 Canada section
 * lists only 03.1-03.5, and registration is the necessary companion fact to 03.1/03.4's
 * own filing-obligation questions, the same way COMPLY-P1-02.1's own US rate seed and
 * COMPLY-P1-02.2's own nexus tracker were split into separate stories but share one engine).
 *
 * A strict EXCEEDS comparison -- the CRA's own statutory language for losing small-
 * supplier status is "exceeds $30,000," the same wording convention (not "$30,000 or
 * more") this module's own GSTR-1 B2C Large threshold and Rule 138(1) e-way-bill threshold
 * already use `>` for, a deliberate departure from COMPLY-P1-02.8's own "$600 or more"
 * 1099 threshold, which really is inclusive under its own different statutory wording.
 *
 * **What this does NOT model, named explicitly** (see the seed migration's own header
 * comment): the real single-quarter-vs-rolling-four-quarter registration TIMING
 * distinction. This function answers only "has cumulative revenue exceeded the
 * threshold," never when registration must actually happen by.
 */
export function determineSmallSupplierRegistrationObligation(
  cumulativeRevenueCad: number,
  thresholdRule: ResolvedSmallSupplierThresholdRule | null,
): SmallSupplierRegistrationDetermination {
  if (!thresholdRule) {
    return { resolved: false, obligated: null, thresholdCad: null, reason: "No small-supplier threshold rule on file for this date.", ruleRefs: [] };
  }

  const obligated = cumulativeRevenueCad > thresholdRule.thresholdCad;
  return {
    resolved: true,
    obligated,
    thresholdCad: thresholdRule.thresholdCad,
    reason: obligated
      ? `Cumulative revenue of $${cumulativeRevenueCad.toFixed(2)} CAD exceeds the $${thresholdRule.thresholdCad} CAD small-supplier threshold (${thresholdRule.label}).`
      : `Cumulative revenue of $${cumulativeRevenueCad.toFixed(2)} CAD does not exceed the $${thresholdRule.thresholdCad} CAD small-supplier threshold (${thresholdRule.label}).`,
    ruleRefs: [thresholdRule.rule.id],
  };
}
