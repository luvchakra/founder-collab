/**
 * FIN-2 (Backfill, §41) -- scans `core.documents` and `core.payment_allocations` for
 * anything with an accounting consequence that never reached `gst.journal_entries`
 * (typically because it was issued before the business licensed Finance), posts the
 * eligible ones through the same idempotent path the live event drain uses, and routes
 * whatever can't post to FIN-1's exceptions queue instead of dropping it silently.
 */

export type BackfillCandidateKind = "document" | "payment_allocation";

export type BackfillCandidate = {
  kind: BackfillCandidateKind;
  id: string;
  /** For a document: its own id. For a payment allocation: the document id it settles --
   * the run function needs this to call `postPaymentAllocation`, which itself resolves
   * the document. */
  documentId: string;
  label: string;
};

export type BackfillScan = {
  documents: BackfillCandidate[];
  paymentAllocations: BackfillCandidate[];
};

/** What actually happened when the run tried to post one candidate. */
export type BackfillItemOutcome = "posted" | "already_posted" | "no_consequence" | "exception";

export type BackfillItemResult = {
  kind: BackfillCandidateKind;
  id: string;
  label: string;
  outcome: BackfillItemOutcome;
  /** Set when outcome is "exception" -- the refusal reason `postFinanceEvent` gave. */
  reason?: string;
};

export type BackfillRunResult = {
  scannedDocuments: number;
  scannedPaymentAllocations: number;
  posted: number;
  alreadyPosted: number;
  noConsequence: number;
  exceptions: number;
  items: BackfillItemResult[];
};

/** The shape `apps/web`'s backfill server action returns, and `BackfillScanCard`'s own
 * `useActionState` state -- defined here rather than in the app route so the component
 * (which lives in this package) only depends on `@cofounderai/module-gst`, never on
 * `apps/web` (CLAUDE.md non-negotiable #3: no module may import another layer's
 * internals, and a package importing back from the app that hosts it is the same
 * violation in the other direction). */
export type BackfillRunState = { status: "idle" } | { status: "done"; result: BackfillRunResult } | { status: "error"; message: string };
