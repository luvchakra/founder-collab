import type { Workspace } from "./types";

/**
 * DISC-OFFER-P1 §7-01.1 "Saved Offering Discovery" -- the criteria bundle a founder
 * saves per offering to narrow which future discovery results actually matter. Pulled
 * out of `Workspace` itself so the matching logic (below) takes a plain value object,
 * not a full row -- easier to unit test, and the same "pure function over extracted
 * fields" shape `rediscovery.ts`'s own `computeNextDiscoveryAt` already established.
 */
export type DiscoveryCriteria = {
  minScore: number | null;
  geographyFilter: string[];
  industriesFilter: string[];
  buyerRolesFilter: string[];
  exclusions: string[];
};

export function criteriaFromWorkspace(workspace: Workspace): DiscoveryCriteria {
  return {
    minScore: workspace.discovery_min_score,
    geographyFilter: workspace.discovery_geography_filter,
    industriesFilter: workspace.discovery_industries_filter,
    buyerRolesFilter: workspace.discovery_buyer_roles_filter,
    exclusions: workspace.discovery_exclusions,
  };
}

/** The facts about one candidate (an opportunity, or a prospect being considered for
 * one) this criteria bundle can actually be checked against -- deliberately a narrow,
 * explicit shape rather than accepting a full `Opportunity`/`Prospect` row, so a caller
 * can't accidentally rely on a field this function doesn't actually use. */
export type DiscoveryCriteriaCandidate = {
  score: number | null;
  industry: string | null;
  location: string | null;
  companyName: string | null;
  buyerRole: string | null;
};

export type DiscoveryCriteriaResult = { matches: boolean; reason: string | null };

function containsAnyKeyword(value: string | null, keywords: string[]): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/**
 * Pure, deterministic, no AI call (CLAUDE.md dev principle #4) -- every filter is a
 * free-text keyword match (see the migration's own comment for why: `industry`/
 * `location`/a buyer persona's own `role` are themselves free text in this schema, no
 * fixed catalog exists for any of them to match against more precisely). An empty
 * filter array means "no restriction," never "matches nothing" -- a criteria bundle a
 * founder never touched must not silently exclude every result.
 *
 * Exclusions are checked FIRST and win outright regardless of every other criterion --
 * an explicitly excluded company is excluded, even if it would otherwise score above
 * the minimum and match every filter. `minScore` against a candidate with an unknown
 * (`null`) score never guesses a pass -- "never guess in the risky direction" (this
 * backlog's own repeated convention, e.g. 05.2/05.5): a caller cannot confirm an
 * unscored candidate clears the floor, so it does not match, with a reason explaining
 * why rather than a silent exclusion.
 */
export function matchesDiscoveryCriteria(criteria: DiscoveryCriteria, candidate: DiscoveryCriteriaCandidate): DiscoveryCriteriaResult {
  if (
    containsAnyKeyword(candidate.companyName, criteria.exclusions) ||
    containsAnyKeyword(candidate.industry, criteria.exclusions) ||
    containsAnyKeyword(candidate.location, criteria.exclusions)
  ) {
    return { matches: false, reason: "Excluded by the offering's own saved exclusion list." };
  }

  if (criteria.minScore !== null) {
    if (candidate.score === null) return { matches: false, reason: "Score is not yet known, cannot confirm it meets the saved minimum." };
    if (candidate.score < criteria.minScore) return { matches: false, reason: `Score ${candidate.score} is below the saved minimum of ${criteria.minScore}.` };
  }

  if (criteria.geographyFilter.length > 0 && !containsAnyKeyword(candidate.location, criteria.geographyFilter)) {
    return { matches: false, reason: "Location does not match the offering's own saved geography filter." };
  }

  if (criteria.industriesFilter.length > 0 && !containsAnyKeyword(candidate.industry, criteria.industriesFilter)) {
    return { matches: false, reason: "Industry does not match the offering's own saved industries filter." };
  }

  if (criteria.buyerRolesFilter.length > 0 && !containsAnyKeyword(candidate.buyerRole, criteria.buyerRolesFilter)) {
    return { matches: false, reason: "Buyer role does not match the offering's own saved buyer-roles filter." };
  }

  return { matches: true, reason: null };
}

export const EMPTY_DISCOVERY_CRITERIA: DiscoveryCriteria = {
  minScore: null,
  geographyFilter: [],
  industriesFilter: [],
  buyerRolesFilter: [],
  exclusions: [],
};
