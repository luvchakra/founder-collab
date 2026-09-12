import type { EinvoiceReportingDeadlineStatus } from "../einvoice-reporting-window/determine";

/**
 * COMPLY-P0-05.6 (E-Invoice Status): the backlog's own named vocabulary verbatim --
 * "Ready/Submitted/Accepted/Rejected/Cancelled/Failed/Deadline Breached" -- plus one
 * documented addition, `not_applicable`, for a business this module can positively tell
 * is not obligated to e-invoice at all (COMPLY-P0-05.1's own `mandated: false`). Adding a
 * status beyond the backlog's literal list has precedent: COMPLY-P0-05.5's own
 * `EinvoiceReportingDeadlineStatus` added `not_restricted`/`unknown` beyond its own
 * literal "30-day restriction" description for the same reason -- the real domain has
 * more distinct cases than the backlog's one-line summary names, and inventing a false
 * "Ready" for a business that isn't required to e-invoice at all would be exactly the kind
 * of misleading compliance signal backlog rule 11 forbids.
 *
 * NOT every code in this union is reachable by `determineEinvoiceStatus` below today:
 * see that function's own docstring for exactly which three are not, and why.
 */
export type EinvoiceStatusCode =
  | "not_applicable"
  | "ready"
  | "submitted"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "failed"
  | "deadline_breached";

export type EinvoiceStatusResult = {
  status: EinvoiceStatusCode;
  reason: string;
  /** The facts this status was derived from, surfaced for traceability (backlog rule 14 /
   * the future COMPLY-P0-10.4 Source Traceability story's own job) -- never hidden behind
   * the single `status` code alone. */
  mandated: boolean | null;
  deadlineStatus: EinvoiceReportingDeadlineStatus;
  einvoiceRowStatus: "generated" | "cancelled" | null;
};
