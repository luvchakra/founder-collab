import type { ReturnPeriodStatus } from "./types";

/**
 * COMPLY-P0-07.5 (Return Review Workflow): the state machine behind "Draft -> Validate ->
 * Review -> Approve -> File" -- pure and DB-independent, unit-tested standalone, same
 * "pure logic, thin query/mutation layer" split every other epic in this module already
 * follows (`gstr1/classify.ts` vs. `gstr1/queries.ts`, etc.).
 *
 * **Forward-only, one step at a time, by deliberate design**: this backlog's own one-line
 * spec for this story describes a single forward pipeline, nothing more -- no reject/reopen
 * path, no skipping a stage. A "send back to draft for correction" flow is a real,
 * plausible future need (see this file's own bottom-of-file note) but is NOT invented
 * here, per backlog rule 5 ("do not implement future stories implicitly") -- adding it
 * later only needs a new entry in `FORWARD_TRANSITIONS` (or a genuinely separate reverse
 * map), not a schema change, since `status_history` already records every transition
 * generically.
 */
const FORWARD_TRANSITIONS: Record<ReturnPeriodStatus, ReturnPeriodStatus | null> = {
  draft: "validated",
  validated: "in_review",
  in_review: "approved",
  approved: "filed",
  filed: null,
};

/** The one legal next stage from `current`, or `null` when `current` is already the
 * terminal stage (`"filed"`). */
export function nextStatus(current: ReturnPeriodStatus): ReturnPeriodStatus | null {
  return FORWARD_TRANSITIONS[current];
}

/** Whether moving directly from `from` to `to` is a legal single-step transition. */
export function canTransition(from: ReturnPeriodStatus, to: ReturnPeriodStatus): boolean {
  return FORWARD_TRANSITIONS[from] === to;
}

/** Throws a clear, user-facing error naming the one legal next stage (or that there is
 * none) unless `from -> to` is that exact transition. `mutations.ts` calls this against a
 * FRESH read of the period's own current status immediately before writing -- never a
 * caller-supplied "I assume it's still in review" status -- so a stale UI (two reviewers
 * racing, or a period someone else already advanced) is rejected with a clear message
 * rather than silently skipping a stage or clobbering a concurrent transition. */
export function assertCanTransition(from: ReturnPeriodStatus, to: ReturnPeriodStatus): void {
  if (canTransition(from, to)) return;
  const legalNext = nextStatus(from);
  throw new Error(
    legalNext
      ? `Cannot move this return period from "${from}" to "${to}" -- the only valid next stage is "${legalNext}".`
      : `Cannot move this return period from "${from}" -- it is already at its final stage.`,
  );
}

/**
 * Follow-up deliberately left out of this story (see this file's own top-of-file note):
 * a "reject back to an earlier stage" transition (e.g. a reviewer sends an `in_review`
 * period back to `draft` for correction). `docs/design/compliance-backlog-audit.md`'s own
 * COMPLY-P0-07.5 story-log entry names this as a real, plausible gap, not an oversight.
 */
