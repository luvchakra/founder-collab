/**
 * INT-07.1's "Cross-Module Exception Model" -- a shared vocabulary for "something
 * crossing a module boundary is stuck on an explicit human decision," aggregated
 * business-wide (not opportunity-scoped, unlike the Journey model INT-01.1 already
 * built -- that one answers "where does *this* opportunity stand," this one answers
 * "what, across the whole business, currently needs someone's attention"). Deliberately
 * narrow to two kinds for this story: both are states this backlog already gave an
 * explicit, well-defined "undecided" meaning to (INT-03.3's shortage-resolution gate,
 * INT-04.1's assessment gate) -- a fulfillment shortage under a recorded "wait for
 * complete quantity" decision (INT-05.1) or a first-time-unrequested assessment (no
 * gate ever set) are deliberately NOT modeled as exceptions here: both already have
 * their own dedicated, always-visible surface on the opportunity detail page
 * (Inventory fulfillment / Assessment cards), so a second aggregate here would just be
 * a redundant read of the same state, not new information a founder couldn't already
 * see. What's genuinely missing today -- and what this model adds -- is a *business-
 * wide* view: today a founder can only discover an unresolved parts shortage or a
 * stuck assessment by opening each job/opportunity individually.
 */
export type ExceptionKind = "fsm_parts_shortage" | "assessment_pending";

export type CrossModuleException = {
  /** Stable per (kind, sourceId) -- a job can have at most one open parts-shortage
   * exception at a time (INT-03.2's own idempotency already prevents a second
   * concurrent reservation attempt), same for an opportunity's assessment gate. */
  id: string;
  kind: ExceptionKind;
  module: "fsm" | "crm";
  label: string;
  detail: string | null;
  detailHref: string;
  /** INT-07.2: the raw entity id a resolution action targets -- the job id for
   * `fsm_parts_shortage`, the opportunity id for `assessment_pending`. Kept separate
   * from `detailHref` (a UI link) so an action doesn't have to parse a URL. */
  entityId: string;
  /** INT-07.2, `assessment_pending` only: whether an FSM assessment has already been
   * requested. Drives which resolution action the row offers -- "Request assessment"
   * when false, nothing inline when true (recording a real outcome needs narrative
   * detail only FSM's own assessment page collects; this model doesn't invent a second,
   * inline way to do that). Null for every other kind. */
  assessmentRequested: boolean | null;
};
