import { fuzzyIncludes } from "../scoring/score-prospect";
import type { BuyerPersona } from "../personas/types";
import type { RelevanceToOffering } from "./types";

export type RelevanceResult = { level: RelevanceToOffering; reason: string };

/**
 * DISC-OFFER-P0-06.3: "relevance to offering" -- deterministic, no AI call. A matched
 * buyer persona (a real row, matched by 06.2's own `matchBuyingCommittee`) is the
 * strongest signal available and its own priority carries straight through; absent
 * that, a plain ICP target-role match is a weaker but still real signal (reusing the
 * same `fuzzyIncludes` 05.5/06.2 already reuse from `score-prospect.ts`, so "does this
 * title match" has exactly one definition in this module). "unknown" (never "low") when
 * there is no job title at all to judge in the first place -- absence of a title is not
 * evidence of irrelevance, the same distinction `Seniority`'s own "unknown" makes.
 */
export function deriveRelevance(input: {
  persona: BuyerPersona | null;
  jobTitle: string | null;
  icpRoles: string[];
}): RelevanceResult {
  const { persona, jobTitle, icpRoles } = input;

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
