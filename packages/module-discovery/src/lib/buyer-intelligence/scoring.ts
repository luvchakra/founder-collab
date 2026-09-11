import type { BuyerPersonIntelligence, Contactability, RelevanceToOffering } from "./types";

const RELEVANCE_RANK: Record<RelevanceToOffering, number> = { high: 3, medium: 2, low: 1, unknown: 0 };
const CONTACTABILITY_RANK: Record<Contactability, number> = { high: 3, medium: 2, low: 1 };

const RELEVANCE_TO_BUYER_FIT_SCORE: Record<Exclude<RelevanceToOffering, "unknown">, number> = {
  high: 90,
  medium: 60,
  low: 30,
};
const CONTACTABILITY_TO_SCORE: Record<Contactability, number> = { high: 90, medium: 60, low: 30 };

export type BuyerFitScores = {
  buyerFitScore: number | null;
  contactabilityScore: number | null;
  primaryContactId: string | null;
};

/**
 * DISC-OFFER-P0-06.3: picks the single strongest real candidate buyer (highest
 * relevance, ties broken by contactability) to represent the opportunity's own
 * `buyer_fit_score`/`contactability_score` -- both named by 05.2 but left unpopulated
 * until now, the same situation `signal_strength_score` (05.3) and `timing_score`
 * (05.4) were each in before their own story populated them. No candidates, or every
 * candidate's relevance is "unknown" (no job title on file for anyone), leaves both
 * scores null -- "no false precision" rather than guessing at a buyer fit this module
 * genuinely doesn't know yet.
 */
export function computeBuyerFitScores(candidates: BuyerPersonIntelligence[]): BuyerFitScores {
  const known = candidates.filter((candidate) => candidate.relevance !== "unknown");
  if (known.length === 0) {
    return { buyerFitScore: null, contactabilityScore: null, primaryContactId: null };
  }

  const primary = known.reduce((best, current) => {
    const relevanceDelta = RELEVANCE_RANK[current.relevance] - RELEVANCE_RANK[best.relevance];
    if (relevanceDelta !== 0) return relevanceDelta > 0 ? current : best;
    const contactabilityDelta = CONTACTABILITY_RANK[current.contactability] - CONTACTABILITY_RANK[best.contactability];
    return contactabilityDelta > 0 ? current : best;
  });

  return {
    buyerFitScore: RELEVANCE_TO_BUYER_FIT_SCORE[primary.relevance as Exclude<RelevanceToOffering, "unknown">],
    contactabilityScore: CONTACTABILITY_TO_SCORE[primary.contactability],
    primaryContactId: primary.contact.id,
  };
}
