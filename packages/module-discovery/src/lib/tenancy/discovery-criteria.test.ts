import { describe, expect, it } from "vitest";
import { EMPTY_DISCOVERY_CRITERIA, matchesDiscoveryCriteria, type DiscoveryCriteria, type DiscoveryCriteriaCandidate } from "./discovery-criteria";

const CANDIDATE: DiscoveryCriteriaCandidate = {
  score: 80,
  industry: "Financial Services",
  location: "Toronto, Canada",
  companyName: "Acme Corp",
  buyerRole: "VP Engineering",
};

describe("matchesDiscoveryCriteria", () => {
  it("matches everything when every filter is empty (no restriction set)", () => {
    expect(matchesDiscoveryCriteria(EMPTY_DISCOVERY_CRITERIA, CANDIDATE)).toEqual({ matches: true, reason: null });
  });

  it("matches a fully unscored, fully unknown candidate when no criteria are set", () => {
    const emptyCandidate: DiscoveryCriteriaCandidate = { score: null, industry: null, location: null, companyName: null, buyerRole: null };
    expect(matchesDiscoveryCriteria(EMPTY_DISCOVERY_CRITERIA, emptyCandidate).matches).toBe(true);
  });

  it("rejects a candidate below the saved minimum score", () => {
    const criteria: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, minScore: 90 };
    expect(matchesDiscoveryCriteria(criteria, CANDIDATE)).toEqual({ matches: false, reason: "Score 80 is below the saved minimum of 90." });
  });

  it("accepts a candidate exactly at the saved minimum score", () => {
    const criteria: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, minScore: 80 };
    expect(matchesDiscoveryCriteria(criteria, CANDIDATE).matches).toBe(true);
  });

  it("never guesses a pass for an unscored candidate when a minimum is set", () => {
    const criteria: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, minScore: 50 };
    const unscored: DiscoveryCriteriaCandidate = { ...CANDIDATE, score: null };
    expect(matchesDiscoveryCriteria(criteria, unscored)).toEqual({
      matches: false,
      reason: "Score is not yet known, cannot confirm it meets the saved minimum.",
    });
  });

  it("matches geography/industry/buyer-role filters case-insensitively via substring", () => {
    const criteria: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, geographyFilter: ["canada"], industriesFilter: ["financial"], buyerRolesFilter: ["engineering"] };
    expect(matchesDiscoveryCriteria(criteria, CANDIDATE).matches).toBe(true);
  });

  it("rejects when the location doesn't match any geography filter keyword", () => {
    const criteria: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, geographyFilter: ["Germany", "France"] };
    expect(matchesDiscoveryCriteria(criteria, CANDIDATE)).toEqual({ matches: false, reason: "Location does not match the offering's own saved geography filter." });
  });

  it("rejects when the industry doesn't match any industries filter keyword", () => {
    const criteria: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, industriesFilter: ["Healthcare"] };
    expect(matchesDiscoveryCriteria(criteria, CANDIDATE).matches).toBe(false);
  });

  it("rejects when the buyer role doesn't match any buyer-roles filter keyword", () => {
    const criteria: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, buyerRolesFilter: ["Marketing"] };
    expect(matchesDiscoveryCriteria(criteria, CANDIDATE).matches).toBe(false);
  });

  it("exclusions win outright, even over an otherwise-perfect match", () => {
    const criteria: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, minScore: 10, exclusions: ["Acme"] };
    expect(matchesDiscoveryCriteria(criteria, CANDIDATE)).toEqual({ matches: false, reason: "Excluded by the offering's own saved exclusion list." });
  });

  it("checks exclusions against industry and location too, not just company name", () => {
    const byIndustry: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, exclusions: ["financial services"] };
    expect(matchesDiscoveryCriteria(byIndustry, CANDIDATE).matches).toBe(false);
    const byLocation: DiscoveryCriteria = { ...EMPTY_DISCOVERY_CRITERIA, exclusions: ["Toronto"] };
    expect(matchesDiscoveryCriteria(byLocation, CANDIDATE).matches).toBe(false);
  });
});
