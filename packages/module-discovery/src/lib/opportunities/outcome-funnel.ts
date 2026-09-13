import type { ProspectOutcome } from "../prospects/types";

/**
 * DISC-OFFER-P1-04.2: "Learn From Outcomes" -- the doc's own worked example is a plain
 * data-flow diagram ("Offering → Discovery → Opportunity → Contact → Conversation → CRM
 * → Outcome") plus one goal: "Measure whether Discovery produces useful opportunities."
 * Every link in that chain already exists structurally in this schema
 * (`opportunities.prospect_id` → `prospects`, `contacts.prospect_id`/
 * `conversations.prospect_id` → `prospects`, `opportunities.status === "sent_to_crm"`
 * for the CRM handoff, `prospects.outcome` for the deal result) -- nothing new to
 * connect, so this story is purely the *measurement* the doc asks for, computed from
 * facts already on those existing rows (CLAUDE.md dev principle #7 -- no new column/
 * table for a value fully derivable from what's already there).
 *
 * A distinct, narrower concept from the pre-existing `lib/prospects/pipeline.ts`
 * `ConversionFunnel` -- that one tracks per-prospect *outreach engagement* (research →
 * score → strategize → message → sent → replied → closed), predating the Opportunity
 * model (DISC-OFFER-P0-05.1) entirely and never reaching CRM handoff or deal outcome.
 * This one tracks the doc's own opportunity-level chain instead, ending at the actual
 * business result (won/lost), not just a conversation closing.
 */
export type OpportunityOutcomeFact = {
  /** DISC-OFFER-P0-08.1: an opportunity that has been (or still is) sent to CRM --
   * `OpportunityStatus === "sent_to_crm"` is this module's own literal "handed off"
   * state; a status that later moved on from that is out of scope for Discovery to
   * track further (`docs/plan/10-...` §20's own "Discovery should retain downstream
   * outcome references but not own CRM lifecycle" -- `prospects.outcome` below is
   * exactly that retained reference, not a second copy of the CRM's own lifecycle). */
  sentToCrm: boolean;
  /** Whether this opportunity's prospect has at least one contact on file. */
  hasContact: boolean;
  /** Whether this opportunity's prospect has at least one conversation started. */
  hasConversation: boolean;
  /** The prospect's own deal result -- "open" until a conversation closes one way or
   * the other (`lib/prospects/types.ts`). */
  outcome: ProspectOutcome;
};

export type OpportunityOutcomeFunnel = {
  totalOpportunities: number;
  withContact: number;
  withConversation: number;
  sentToCrm: number;
  won: number;
  lost: number;
  open: number;
  /** "Measure whether Discovery produces useful opportunities" -- the doc's own literal
   * goal, answered as the plain share of every opportunity Discovery has ever surfaced
   * for this offering that went on to become a won deal. Null with zero opportunities --
   * "no false precision" (the same restraint every other percentage/score in this
   * module already applies): 0% would misreport "nothing to measure yet" as "Discovery
   * failed here". */
  winRate: number | null;
};

/**
 * Pure and deterministic (CLAUDE.md dev principle #4 -- no LLM for a computable
 * aggregate). Each stage's count is independently true/false per opportunity (not a
 * strict "furthest stage reached" ladder the way `computeConversionFunnel`'s prospect
 * stages are) -- an opportunity can, for instance, be sent to CRM before a conversation
 * is ever logged in this module, so counts are not required to nest.
 */
export function computeOpportunityOutcomeFunnel(facts: OpportunityOutcomeFact[]): OpportunityOutcomeFunnel {
  const totalOpportunities = facts.length;
  const withContact = facts.filter((f) => f.hasContact).length;
  const withConversation = facts.filter((f) => f.hasConversation).length;
  const sentToCrm = facts.filter((f) => f.sentToCrm).length;
  const won = facts.filter((f) => f.outcome === "won").length;
  const lost = facts.filter((f) => f.outcome === "lost").length;
  const open = totalOpportunities - won - lost;

  return {
    totalOpportunities,
    withContact,
    withConversation,
    sentToCrm,
    won,
    lost,
    open,
    winRate: totalOpportunities > 0 ? Math.round((won / totalOpportunities) * 100) : null,
  };
}
