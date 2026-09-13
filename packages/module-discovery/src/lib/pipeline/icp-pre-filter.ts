/**
 * DISC-OFFER-P1 §7-03.1 "Progressive Intelligence" -- the doc's own pipeline order
 * (Cheap ICP Filtering -> Basic Enrichment -> Signal Detection -> Scoring -> Deep
 * Research -> Personalized Draft) turns out to already hold everywhere except one gap:
 * `runSignalsStage` (handlers.ts) called `researchProspect` -- a real AI call, this
 * pipeline's own "Signal Detection" step -- for every pending account with no cheaper
 * check first. "Basic Enrichment" already happens earlier, at account-discovery time
 * (a `ProspectSuggestion` already carries industry/location/company_size); Scoring is
 * already gated to opportunities that exist; Deep Research (`generateResearchBrief`,
 * `runResearchStage`) is already bounded to the top-`RESEARCH_TOP_N` scored
 * opportunities; message generation ("Personalized Draft") is already gated behind an
 * approved strategy. This is the one missing gate: a free, no-AI-call ICP fit check
 * using fields already on the prospect, run before spending the Signal Detection call.
 *
 * Same shape as `tenancy/discovery-criteria.ts`'s own `matchesDiscoveryCriteria` --
 * free-text keyword matching, empty ICP lists mean "no restriction." Deliberately the
 * OPPOSITE null-handling on missing candidate data, though: `matchesDiscoveryCriteria`
 * never guesses a *pass* for an unscored candidate against a minimum (a false pass would
 * let through a specific request the founder set a floor to protect); this function
 * never guesses a *rejection* for a candidate with an unknown attribute (a false
 * rejection would silently and permanently skip a possibly-good prospect over missing
 * data -- worse than the one cheap-filter's worth of AI spend this story exists to
 * avoid). Only a known, explicitly conflicting attribute skips a prospect.
 */
export type IcpPreFilterCriteria = {
  industries: string[];
  geographies: string[];
  companySizes: string[];
  exclusions: string[];
};

export type IcpPreFilterCandidate = {
  industry: string | null;
  location: string | null;
  companySize: string | null;
};

export type IcpPreFilterResult = { passes: boolean; reason: string | null };

function containsAnyKeyword(value: string | null, keywords: string[]): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function passesIcpPreFilter(criteria: IcpPreFilterCriteria, candidate: IcpPreFilterCandidate): IcpPreFilterResult {
  if (
    containsAnyKeyword(candidate.industry, criteria.exclusions) ||
    containsAnyKeyword(candidate.location, criteria.exclusions)
  ) {
    return { passes: false, reason: "Excluded by the ICP's own exclusion list." };
  }

  if (criteria.industries.length > 0 && candidate.industry !== null && !containsAnyKeyword(candidate.industry, criteria.industries)) {
    return { passes: false, reason: `Industry "${candidate.industry}" does not match the ICP's own industries list.` };
  }

  if (criteria.geographies.length > 0 && candidate.location !== null && !containsAnyKeyword(candidate.location, criteria.geographies)) {
    return { passes: false, reason: `Location "${candidate.location}" does not match the ICP's own geographies list.` };
  }

  if (criteria.companySizes.length > 0 && candidate.companySize !== null && !containsAnyKeyword(candidate.companySize, criteria.companySizes)) {
    return { passes: false, reason: `Company size "${candidate.companySize}" does not match the ICP's own company-sizes list.` };
  }

  return { passes: true, reason: null };
}
