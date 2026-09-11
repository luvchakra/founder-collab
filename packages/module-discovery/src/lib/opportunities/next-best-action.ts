import type { Contactability } from "../buyer-intelligence/types";
import type { NegativeSignalReason } from "../negative-signals/types";
import type { NextBestAction, OpportunityConfidence, OpportunityStatus } from "./types";

/** Reasons 05.5's own detection already treats as a hard disqualifier for this
 * prospect/offering pairing -- if any of these are on record, Dismiss outranks every
 * other consideration (score, evidence, contact quality) regardless of how strong they
 * otherwise look. `insufficient_evidence` and `no_relevant_problem` are deliberately
 * excluded here: neither is a hard "wrong fit" finding the way the other five are, just
 * a gap `research_more` (or `watch`) is the honest response to. */
const HARD_DISQUALIFYING_REASONS: NegativeSignalReason[] = [
  "wrong_industry",
  "wrong_size",
  "wrong_geography",
  "known_incompatible_solution",
  "existing_active_relationship",
  "recent_rejection",
];

/** Only the fields the recommendation actually needs, not the full `Opportunity`/
 * `BuyerPersonIntelligence[]`/`Message[]` rows -- the same "narrow, testable input
 * shape" precedent `NegativeSignalDetectionInput` (05.5) and `ScoreComponents` (05.2)
 * already established. */
export type NextBestActionInput = {
  status: OpportunityStatus;
  score: number | null;
  confidence: OpportunityConfidence;
  hasResearch: boolean;
  negativeSignalReasons: NegativeSignalReason[];
  hasContact: boolean;
  /** The strongest real candidate buyer's own contactability (06.3's own
   * `computeBuyerFitScores`'s `primaryContactId`), null when there is no known
   * candidate at all -- distinct from `hasContact` (a contact can exist with unknown
   * relevance, e.g. no job title on file, and still count as "a contact exists" while
   * having nothing to rate its contactability against here). */
  bestContactability: Contactability | null;
  hasDraftMessage: boolean;
  hasSentMessage: boolean;
};

export type NextBestActionResult = {
  action: NextBestAction | null;
  reason: string;
};

const ACTIONABLE_STATUSES: OpportunityStatus[] = ["new", "reviewing", "action_required", "watching"];

/**
 * DISC-OFFER-P0-07.1: deterministic, no AI call (CLAUDE.md dev principle #4/#5) --
 * "recommendation must be explainable" is satisfied by every branch below returning a
 * plain factual reason for exactly why it fired, not a synthesized justification.
 * Ordered rules, first match wins: an opportunity already resolved (sent to CRM,
 * dismissed, or expired) gets no recommendation at all -- there is nothing left to
 * recommend once a human has already closed it out one way or another.
 */
export function computeNextBestAction(input: NextBestActionInput): NextBestActionResult {
  if (!ACTIONABLE_STATUSES.includes(input.status)) {
    return { action: null, reason: `Opportunity is already ${input.status.replace("_", " ")} -- nothing to recommend.` };
  }

  const dismissingReasons = input.negativeSignalReasons.filter((reason) => HARD_DISQUALIFYING_REASONS.includes(reason));
  if (dismissingReasons.length > 0) {
    return {
      action: "dismiss",
      reason: `Disqualifying signal(s) on record: ${dismissingReasons.join(", ")}.`,
    };
  }

  if (!input.hasResearch || input.score === null) {
    return {
      action: "research_more",
      reason: input.hasResearch
        ? "Research exists but there isn't enough evidence yet to score this opportunity."
        : "This prospect hasn't been researched yet.",
    };
  }

  if (!input.hasContact || input.bestContactability === null || input.bestContactability === "low") {
    return {
      action: "find_better_contact",
      reason: input.hasContact
        ? "The contacts on file have no reliable way to reach them yet."
        : "No contacts recorded for this prospect yet.",
    };
  }

  if (!input.hasDraftMessage && !input.hasSentMessage) {
    return {
      action: "draft_message",
      reason: "A reachable contact exists but no outreach message has been drafted yet.",
    };
  }

  if (input.hasSentMessage && input.confidence === "high" && (input.score ?? 0) >= 60) {
    return {
      action: "send_to_crm",
      reason: `Well-evidenced opportunity (score ${input.score}, ${input.confidence} confidence) with outreach already underway.`,
    };
  }

  if (input.confidence === "low") {
    return {
      action: "watch",
      reason: "Some evidence exists, but not enough yet to justify acting -- keep watching for more signals.",
    };
  }

  return {
    action: "wait",
    reason: "No urgent action right now -- outreach is already in motion.",
  };
}
