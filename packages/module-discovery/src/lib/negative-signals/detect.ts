import { fuzzyIncludes } from "../scoring/score-prospect";
import type { NegativeSignalReason } from "./types";

export type DetectedNegativeSignal = {
  reason: NegativeSignalReason;
  detail: string;
};

/** Only the fields detection actually needs, not the full `Prospect`/`IcpProfile`/
 * `ProspectResearch` rows -- keeps this pure function's own test setup light and its
 * dependency surface explicit, the same reasoning `ScoreComponents` (05.2) is its own
 * small shape rather than the full `Opportunity` row. */
export type NegativeSignalDetectionInput = {
  prospect: {
    industry: string | null;
    company_size: string | null;
    location: string | null;
    outcome: "open" | "won" | "lost";
    updated_at: string;
  };
  /** Null, or not `approved`, means there is nothing honest to compare industry/size/
   * geography against -- same guard `scoreProspect()` already uses ("Approve an ICP
   * before scoring prospects"), so those three checks are skipped entirely rather than
   * false-flagging against a draft or absent ICP. */
  icp: { status: "draft" | "approved"; industries: string[]; company_sizes: string[]; geographies: string[] } | null;
  /** Null means no research has ever been run -- genuinely unknown, not "no problem
   * found" (see `insufficient_evidence` vs `no_relevant_problem` below). */
  research: { pain_points: string[] } | null;
  contactCount: number;
};

/**
 * DISC-OFFER-P0-05.5: "Negative Signals" -- deterministic, no AI call (CLAUDE.md dev
 * principle #4/#5): every one of these seven checks is a plain comparison against data
 * this module already has, the same "don't use an LLM for a deterministic operation"
 * reasoning 05.2/05.3/05.4 already established. `insufficient_evidence` and
 * `no_relevant_problem` are deliberately distinct rather than folded together --
 * "no research has been run" (genuinely unknown) and "research ran and found no pain
 * points" (a real negative finding) are different states, and collapsing them would
 * misrepresent an absence of evidence as evidence of absence, the same "no false
 * precision" discipline 05.2's own `computeOpportunityScore` already applies to missing
 * score components.
 */
export function detectNegativeSignals(input: NegativeSignalDetectionInput): DetectedNegativeSignal[] {
  const results: DetectedNegativeSignal[] = [];
  const { prospect, icp, research, contactCount } = input;

  if (icp && icp.status === "approved") {
    if (icp.industries.length > 0 && !fuzzyIncludes(icp.industries, prospect.industry)) {
      results.push({
        reason: "wrong_industry",
        detail: `Industry "${prospect.industry ?? "unset"}" does not match this offering's ICP industries (${icp.industries.join(", ")}).`,
      });
    }
    if (icp.company_sizes.length > 0 && !fuzzyIncludes(icp.company_sizes, prospect.company_size)) {
      results.push({
        reason: "wrong_size",
        detail: `Company size "${prospect.company_size ?? "unset"}" does not match this offering's ICP company sizes (${icp.company_sizes.join(", ")}).`,
      });
    }
    if (icp.geographies.length > 0 && !fuzzyIncludes(icp.geographies, prospect.location)) {
      results.push({
        reason: "wrong_geography",
        detail: `Location "${prospect.location ?? "unset"}" does not match this offering's ICP geographies (${icp.geographies.join(", ")}).`,
      });
    }
  }

  if (!research) {
    results.push({ reason: "insufficient_evidence", detail: "No research has been run for this prospect yet." });
  } else if (research.pain_points.length === 0) {
    results.push({ reason: "no_relevant_problem", detail: "Research ran but found no pain points for this prospect." });
  }

  if (contactCount === 0) {
    results.push({ reason: "no_buyer", detail: "No contacts are recorded for this prospect." });
  }

  if (prospect.outcome === "lost") {
    results.push({ reason: "recent_rejection", detail: `Outcome is marked "lost" (as of ${prospect.updated_at}).` });
  }

  return results;
}
