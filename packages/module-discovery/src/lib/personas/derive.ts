import type { IcpProfile } from "../icp/types";
import type { PersonaPriority, PersonaRole } from "./types";

export type DerivedPersona = {
  title: string;
  roleInCommittee: PersonaRole;
  priority: PersonaPriority;
  notes: string;
};

// Whole-word markers only (checked against tokenized title words, not raw substring
// `includes`) -- a naive substring match on short markers like "cto"/"vp" false-positives
// constantly (e.g. "Director of IT" contains the literal substring "cto", inside
// "dire-CTO-r"; "Head of Product" contains "hea-D OF-fice"-shaped traps too). Multi-word
// phrases ("vice president", "head of") are still matched as substrings since a partial
// collision there is far less likely.
const EXECUTIVE_TITLE_WORDS = ["chief", "ceo", "cfo", "coo", "cto", "ciso", "cio", "president", "founder", "owner"];
const DECISION_MAKER_TITLE_WORDS = ["vp", "director"];
const DECISION_MAKER_TITLE_PHRASES = ["vice president", "head of"];
const BUDGET_TITLE_WORDS = ["procurement", "finance", "purchasing"];

function titleWords(normalized: string): string[] {
  return normalized.split(/[^a-z]+/).filter(Boolean);
}

/** DISC-OFFER-P0-10.1's own "Identify Buyer Personas" pipeline stage -- deterministic,
 * no AI call (CLAUDE.md dev principle #4/#5): the approved ICP's own `roles` list
 * (DISC-OFFER-P0-02.2, e.g. "CISO", "VP Engineering", "Procurement Manager") already
 * names exactly who this offering is sold to, so a persona per role is proposing
 * structure over a fact the founder already approved -- not inventing new people the way
 * a free-form AI generation over the offering description alone would risk. The
 * buying-committee role a title implies is classified by plain keyword match against the
 * doc's own six-value vocabulary (the same "closed-vocabulary heuristic, not a model's
 * judgment call" precedent DISC-OFFER-P0-05.5's `detectNegativeSignals` and
 * DISC-OFFER-P0-06.3's `deriveSeniority` already established) -- unmatched titles default
 * to "influencer" (present in the buying process, role unclear) rather than "other" (which
 * would read as "not really part of this"). The first persona is marked `high` priority
 * (an ICP's own role list is written most-important-first per its own field's existing
 * convention, e.g. the offering setup wizard's own field ordering), the rest `medium` --
 * a real, if provisional, starting point a founder reviews and edits, never silently
 * treated as final.
 */
export function deriveBuyerPersonasFromIcp(icp: Pick<IcpProfile, "roles">): DerivedPersona[] {
  return icp.roles
    .map((role) => role.trim())
    .filter((role) => role.length > 0)
    .map((title, index) => {
      const normalized = title.toLowerCase();
      const words = titleWords(normalized);
      const isExecutive = EXECUTIVE_TITLE_WORDS.some((marker) => words.includes(marker));
      const isDecisionMaker =
        DECISION_MAKER_TITLE_WORDS.some((marker) => words.includes(marker)) ||
        DECISION_MAKER_TITLE_PHRASES.some((phrase) => normalized.includes(phrase));
      const isBudget = BUDGET_TITLE_WORDS.some((marker) => words.includes(marker));

      const roleInCommittee: PersonaRole = isExecutive
        ? "executive_buyer"
        : isDecisionMaker
          ? "decision_maker"
          : isBudget
            ? "budget_stakeholder"
            : "influencer";

      return {
        title,
        roleInCommittee,
        priority: index === 0 ? "high" : ("medium" as PersonaPriority),
        notes: "Suggested from the offering's ICP buyer roles by AI Discovery -- review and adjust as needed.",
      };
    });
}
