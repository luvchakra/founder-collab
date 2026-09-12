import type { EinvoiceReportingDeadlineStatus } from "../einvoice-reporting-window/determine";
import type { EinvoiceStatusResult } from "./types";

/**
 * COMPLY-P0-05.6 (E-Invoice Status): "Ready/Submitted/Accepted/Rejected/Cancelled/Failed/
 * Deadline Breached." Pure: every fact this needs (whether a `gst.einvoices` row already
 * exists for this document, COMPLY-P0-05.1's own mandate determination, and COMPLY-P0-05.5's
 * own reporting-deadline determination) is resolved by the caller (`queries.ts`'s own
 * orchestrator), matching this module's established "pure core function, thin orchestrator"
 * convention.
 *
 * A REAL, already-recorded outcome always outranks a forward-looking projection: a
 * `gst.einvoices` row that exists (`"generated"` -> `accepted`, `"cancelled"` -> `cancelled`)
 * wins outright over whatever the mandate/deadline determination would otherwise say --
 * generating an e-invoice for a business the eligibility engine now (perhaps wrongly, given
 * a since-changed turnover estimate) reads as unmandated doesn't retroactively un-accept an
 * IRN the government already issued, and a deadline that has since passed doesn't un-accept
 * one either (the deadline governs whether SUBMISSION is still allowed, not whether an
 * already-accepted invoice remains accepted).
 *
 * Three codes in `EinvoiceStatusCode` are deliberately UNREACHABLE by this function today,
 * flagged here rather than silently never implemented:
 * - `"submitted"`: this platform's own IRP integration (COMPLY-P0-05.3) is a single
 *   synchronous `submit()` call that either returns an IRN or throws -- there is no
 *   observable in-flight/pending gap between "sent to the IRP" and "government responded"
 *   for this function to report a distinct `"submitted"` state during. A future story that
 *   makes generation asynchronous (a queued retry, a webhook callback) would need to
 *   persist that pending state on `gst.einvoices` itself before this function could ever
 *   see and report it.
 * - `"rejected"` / `"failed"`: `generateEinvoice` (COMPLY-P0-05.3/05.4) inserts a
 *   `gst.einvoices` row ONLY on a successful GSP response -- a rejected or technically
 *   failed submission attempt throws and persists nothing at all, so there is no row for
 *   this function to read a rejection/failure out of. Distinguishing a government
 *   rejection (bad data, e.g. a mismatched GSTIN) from a technical failure (network error,
 *   GSP outage) also needs the GSP's own error response shape captured somewhere, which
 *   `callGsp`'s current error handling deliberately sanitizes away rather than persists.
 *   Both require a schema change to `generateEinvoice`'s own error path (recording a
 *   failed-attempt row instead of only throwing) -- a change to the GENERATION MUTATION's
 *   own retry semantics, not this read-only status-derivation story's job. Flagged here as
 *   a concrete follow-up for whichever future story owns that pipeline change.
 */
export function determineEinvoiceStatus(input: {
  einvoiceRowStatus: "generated" | "cancelled" | null;
  mandated: boolean | null;
  deadlineStatus: EinvoiceReportingDeadlineStatus;
}): EinvoiceStatusResult {
  const base = { mandated: input.mandated, deadlineStatus: input.deadlineStatus, einvoiceRowStatus: input.einvoiceRowStatus };

  if (input.einvoiceRowStatus === "cancelled") {
    return { ...base, status: "cancelled", reason: "This e-Invoice was cancelled with the IRP -- a cancelled IRN cannot be reissued for the same document." };
  }

  if (input.einvoiceRowStatus === "generated") {
    return { ...base, status: "accepted", reason: "The IRP has already accepted this document and issued an IRN." };
  }

  if (input.mandated === false) {
    return { ...base, status: "not_applicable", reason: "This business's turnover is not currently mandated for e-invoicing -- no e-Invoice is required for this document." };
  }

  if (input.deadlineStatus === "deadline_breached") {
    return {
      ...base,
      status: "deadline_breached",
      reason: "This invoice's e-invoice reporting window has closed -- the IRP will refuse a submission reported after this date. This document has not been reported.",
    };
  }

  return {
    ...base,
    status: "ready",
    reason: "No e-Invoice has been generated for this document yet, and nothing currently known blocks generating one.",
  };
}
