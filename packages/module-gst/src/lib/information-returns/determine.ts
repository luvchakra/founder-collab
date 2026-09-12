import type { Form1099Determination, ResolvedForm1099ThresholdRule, VendorPaymentTotal } from "./types";

/**
 * COMPLY-P1-02.8: the pure combiner -- given one vendor's own cumulative payment total and
 * the (already-fetched) effective reporting threshold, decide whether this platform can
 * resolve a 1099 obligation for that vendor at all, and if so what it is. DB-independent
 * and unit-tested standalone, the same "pure logic separated from its DB-touching caller"
 * convention every other determination in this module follows.
 *
 * Never guesses in the risky direction (backlog rule 11): a `company`-kind party's own
 * true corporate status (a C-corp/S-corp payment is typically 1099-exempt; other business
 * structures are not) is data this platform does not track, so it is always reported
 * `resolved: false` rather than guessed either way. The IRS's own statutory language is
 * "$600 or more" (inclusive), not "exceeding" -- this uses `>=`, a deliberate departure
 * from this module's own `>` convention for GSTR-1's B2C Large / Rule 138(1) e-way-bill
 * thresholds, which both use "exceeding" wording in their own governing rule text.
 */
export function determineForm1099Obligation(vendor: VendorPaymentTotal, thresholdRule: ResolvedForm1099ThresholdRule | null): Form1099Determination {
  if (vendor.partyKind === "company") {
    return {
      ...vendor,
      resolved: false,
      thresholdUsd: thresholdRule?.thresholdUsd ?? null,
      obligated: null,
      reason: "Payments to a company-kind party may be exempt from 1099-NEC reporting depending on its own corporate entity type (e.g. a C-corp/S-corp), which this platform does not track -- verify with a tax professional.",
      ruleRefs: [],
    };
  }

  if (!thresholdRule) {
    return {
      ...vendor,
      resolved: false,
      thresholdUsd: null,
      obligated: null,
      reason: "No 1099 reporting threshold rule on file for this date.",
      ruleRefs: [],
    };
  }

  const obligated = vendor.totalPaidUsd >= thresholdRule.thresholdUsd;
  return {
    ...vendor,
    resolved: true,
    thresholdUsd: thresholdRule.thresholdUsd,
    obligated,
    reason: obligated
      ? `Total payments of $${vendor.totalPaidUsd.toFixed(2)} meet or exceed the $${thresholdRule.thresholdUsd} reporting threshold (${thresholdRule.label}).`
      : `Total payments of $${vendor.totalPaidUsd.toFixed(2)} are below the $${thresholdRule.thresholdUsd} reporting threshold (${thresholdRule.label}).`,
    ruleRefs: [thresholdRule.rule.id],
  };
}
