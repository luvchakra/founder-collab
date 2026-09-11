import type { RelationshipMatch } from "./types";

/** One `core.parties` row this business already has, matched (exactly or fuzzily)
 * against the incoming company name, plus the CRM-side relationship facts already on
 * record for it -- only what the classification below actually needs, the same "narrow,
 * testable input shape" precedent `NegativeSignalDetectionInput`/`ScoreComponents`
 * (module-discovery) already established. */
export type RelationshipCandidateParty = {
  partyId: string;
  name: string;
  isExactNameMatch: boolean;
  hasCustomerRole: boolean;
  hasOpenLead: boolean;
  hasOpportunity: boolean;
};

export type RelationshipDetectionInput = {
  candidateParties: RelationshipCandidateParty[];
  /** A `core.party_contacts` row whose email matches one of the incoming contacts,
   * attached to a *different* party than any name match above -- "Existing Contact"
   * (doc's own category) is deliberately distinct from a company-name match: the same
   * person could have moved to a different company than the one on record. */
  contactEmailMatch: { partyId: string; partyName: string } | null;
};

/**
 * DISC-OFFER-P0-08.2: deterministic, no AI call (CLAUDE.md dev principle #4/#5) --
 * every one of the doc's own six categories is a plain lookup against real CRM/core
 * data, never a guess. Priority order (first match wins) reflects how far along a
 * relationship already is: an exact company-name match already marked `customer`
 * outranks one that's merely an open lead, which outranks a bare potential duplicate
 * (same name, no established relationship yet) -- each is a stronger reason to stop and
 * look before creating a second lead for what's likely the same real-world account.
 */
export function classifyExistingRelationship(input: RelationshipDetectionInput): RelationshipMatch {
  const exact = input.candidateParties.find((party) => party.isExactNameMatch);
  if (exact) {
    if (exact.hasCustomerRole) {
      return {
        status: "existing_customer",
        matchedPartyId: exact.partyId,
        matchedPartyName: exact.name,
        detail: `"${exact.name}" is already a customer of this business.`,
      };
    }
    if (exact.hasOpportunity) {
      return {
        status: "existing_opportunity",
        matchedPartyId: exact.partyId,
        matchedPartyName: exact.name,
        detail: `"${exact.name}" already has an open CRM opportunity.`,
      };
    }
    if (exact.hasOpenLead) {
      return {
        status: "existing_lead",
        matchedPartyId: exact.partyId,
        matchedPartyName: exact.name,
        detail: `"${exact.name}" is already a CRM lead.`,
      };
    }
    return {
      status: "potential_duplicate",
      matchedPartyId: exact.partyId,
      matchedPartyName: exact.name,
      detail: `A party named "${exact.name}" already exists with no established relationship on record yet.`,
    };
  }

  if (input.contactEmailMatch) {
    return {
      status: "existing_contact",
      matchedPartyId: input.contactEmailMatch.partyId,
      matchedPartyName: input.contactEmailMatch.partyName,
      detail: `A contact with this email is already on file under "${input.contactEmailMatch.partyName}".`,
    };
  }

  const fuzzy = input.candidateParties.find((party) => !party.isExactNameMatch);
  if (fuzzy) {
    return {
      status: "potential_duplicate",
      matchedPartyId: fuzzy.partyId,
      matchedPartyName: fuzzy.name,
      detail: `A similarly-named party "${fuzzy.name}" already exists -- check it isn't the same account.`,
    };
  }

  return { status: "new_prospect", matchedPartyId: null, matchedPartyName: null, detail: null };
}
