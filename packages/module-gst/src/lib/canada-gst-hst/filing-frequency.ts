import type { GstHstFilingFrequency, ResolvedFilingFrequencyThresholdRule } from "./types";

export type FilingFrequencyDetermination = {
  resolved: boolean;
  frequency: GstHstFilingFrequency | null;
  reason: string;
  ruleRefs: string[];
};

/**
 * COMPLY-P1-03.4 (Filing Periods): the CRA's own default filing-frequency assignment --
 * annual for CAD 1,500,000 or less in annual taxable supplies, quarterly above that up to
 * CAD 6,000,000, monthly above CAD 6,000,000. A registrant may always ELECT a more
 * frequent period than this default (never a less frequent one) -- that election is a
 * business's own choice, not modeled here as a rule; a caller wanting to honor an election
 * simply skips calling this function and uses the elected frequency directly.
 */
export function determineGstHstFilingFrequency(
  annualRevenueCad: number,
  thresholdRule: ResolvedFilingFrequencyThresholdRule | null,
): FilingFrequencyDetermination {
  if (!thresholdRule) {
    return { resolved: false, frequency: null, reason: "No filing-frequency threshold rule on file for this date.", ruleRefs: [] };
  }

  let frequency: GstHstFilingFrequency;
  if (annualRevenueCad <= thresholdRule.annualThresholdCad) frequency = "annual";
  else if (annualRevenueCad <= thresholdRule.quarterlyThresholdCad) frequency = "quarterly";
  else frequency = "monthly";

  return {
    resolved: true,
    frequency,
    reason: `Annual revenue of $${annualRevenueCad.toFixed(2)} CAD assigns ${frequency} filing (${thresholdRule.label}). A registrant may elect a more frequent period.`,
    ruleRefs: [thresholdRule.rule.id],
  };
}
