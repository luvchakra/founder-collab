import { fuzzyIncludes } from "../scoring/score-prospect";
import { BUYING_ROLE_LABEL, type BuyingRole } from "../contacts/types";
import type { BuyerPersona } from "../personas/types";
import type { RelevanceToOffering } from "./types";

export type RelevanceResult = { level: RelevanceToOffering; reason: string };

/** DISC-OFFER-P1-04.3: how much a founder-set buying role matters to this offering's
 * sale. Anyone who can approve, fund or block the purchase is high; people who shape or
 * use it are medium; "not involved" is low. */
const BUYING_ROLE_RELEVANCE: Record<BuyingRole, RelevanceToOffering> = {
  executive_buyer: "high",
  decision_maker: "high",
  budget_stakeholder: "high",
  influencer: "medium",
  user: "medium",
  other: "medium",
  not_involved: "low",
};

/**
 * DISC-OFFER-P0-06.3: "relevance to offering" -- deterministic, no AI call. A matched
 * buyer persona (a real row, matched by 06.2's own `matchBuyingCommittee`) is the
 * strongest signal available and its own priority carries straight through; absent
 * that, a plain ICP target-role match is a weaker but still real signal (reusing the
 * same `fuzzyIncludes` 05.5/06.2 already reuse from `score-prospect.ts`, so "does this
 * title match" has exactly one definition in this module). "unknown" (never "low") when
 * there is no job title at all to judge in the first place -- absence of a title is not
 * evidence of irrelevance, the same distinction `Seniority`'s own "unknown" makes.
 *
 * DISC-OFFER-P1-04.3 "Offering-Specific Contact Relevance": a buying role the founder set
 * on this offering's own contact row outranks every derived signal -- it is the one input
 * that can differ for the same person with the same title across two offerings.
 */
export function deriveRelevance(input: {
  persona: BuyerPersona | null;
  jobTitle: string | null;
  icpRoles: string[];
  buyingRole?: BuyingRole | null;
}): RelevanceResult {
  const { persona, jobTitle, icpRoles, buyingRole } = input;

  if (buyingRole) {
    return {
      level: BUYING_ROLE_RELEVANCE[buyingRole],
      reason: `Set as ${BUYING_ROLE_LABEL[buyingRole].toLowerCase()} for this offering.`,
    };
  }

  if (persona) {
    return {
      level: persona.priority,
      reason: `Matches this offering's "${persona.title}" buyer persona (${persona.priority} priority).`,
    };
  }
  if (fuzzyIncludes(icpRoles, jobTitle)) {
    return {
      level: "medium",
      reason: "Title matches this offering's ICP target roles, though no buyer persona is defined for it.",
    };
  }
  if (jobTitle) {
    return {
      level: "low",
      reason: "Title does not match any defined buyer persona or ICP target role.",
    };
  }
  return { level: "unknown", reason: "No job title on file -- relevance cannot be assessed." };
}
