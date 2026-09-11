import { describe, expect, it } from "vitest";
import { classifyExistingRelationship, type RelationshipCandidateParty } from "./detect";

function candidate(overrides: Partial<RelationshipCandidateParty>): RelationshipCandidateParty {
  return {
    partyId: "party-1",
    name: "Acme Corp",
    isExactNameMatch: true,
    hasCustomerRole: false,
    hasOpenLead: false,
    hasOpportunity: false,
    ...overrides,
  };
}

describe("classifyExistingRelationship", () => {
  it("returns new_prospect when nothing matches at all", () => {
    const result = classifyExistingRelationship({ candidateParties: [], contactEmailMatch: null });
    expect(result.status).toBe("new_prospect");
    expect(result.matchedPartyId).toBeNull();
  });

  it("prioritizes existing_customer over every other exact-match signal", () => {
    const result = classifyExistingRelationship({
      candidateParties: [candidate({ hasCustomerRole: true, hasOpportunity: true, hasOpenLead: true })],
      contactEmailMatch: null,
    });
    expect(result.status).toBe("existing_customer");
  });

  it("prioritizes existing_opportunity over existing_lead", () => {
    const result = classifyExistingRelationship({
      candidateParties: [candidate({ hasOpportunity: true, hasOpenLead: true })],
      contactEmailMatch: null,
    });
    expect(result.status).toBe("existing_opportunity");
  });

  it("returns existing_lead for an exact match with only an open lead", () => {
    const result = classifyExistingRelationship({
      candidateParties: [candidate({ hasOpenLead: true })],
      contactEmailMatch: null,
    });
    expect(result.status).toBe("existing_lead");
  });

  it("returns potential_duplicate for an exact-name match with no relationship on record", () => {
    const result = classifyExistingRelationship({ candidateParties: [candidate({})], contactEmailMatch: null });
    expect(result.status).toBe("potential_duplicate");
    expect(result.matchedPartyName).toBe("Acme Corp");
  });

  it("returns existing_contact when only an email match is found, ahead of a fuzzy name match", () => {
    const result = classifyExistingRelationship({
      candidateParties: [candidate({ isExactNameMatch: false, name: "Acme Corporation" })],
      contactEmailMatch: { partyId: "party-2", partyName: "Someone Else Inc" },
    });
    expect(result.status).toBe("existing_contact");
    expect(result.matchedPartyName).toBe("Someone Else Inc");
  });

  it("returns potential_duplicate for a fuzzy (non-exact) name match with no email match", () => {
    const result = classifyExistingRelationship({
      candidateParties: [candidate({ isExactNameMatch: false, name: "Acme Corporation" })],
      contactEmailMatch: null,
    });
    expect(result.status).toBe("potential_duplicate");
    expect(result.matchedPartyName).toBe("Acme Corporation");
  });
});
