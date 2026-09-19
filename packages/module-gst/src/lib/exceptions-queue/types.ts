/**
 * FIN-1 (Finance exceptions queue, §38) -- see
 * `supabase/migrations/20260919100000_gst_finance_exceptions.sql`'s own docstring for the
 * full scope/design trail, including why this is a second table rather than a widened
 * `gst.reconciliation_exceptions` (`lib/exceptions/types.ts`).
 */

export type FinanceExceptionType = "unposted_document" | "itc_at_risk" | "filing_blocker";

export const FINANCE_EXCEPTION_TYPES: FinanceExceptionType[] = ["unposted_document", "itc_at_risk", "filing_blocker"];

export type FinanceExceptionStatus = "open" | "in_review" | "resolved" | "ignored";

export const FINANCE_EXCEPTION_STATUSES: FinanceExceptionStatus[] = ["open", "in_review", "resolved", "ignored"];

export type FinanceExceptionStatusHistoryEntry = {
  status: FinanceExceptionStatus;
  note: string | null;
  at: string;
  by: string | null;
};

/** A candidate exception derived from a fresh scan of the three sources -- `derive.ts`'s
 * own output, before it's ever compared against what's already persisted. Not yet a real
 * `FinanceException` row (no id, no status, no owner). */
export type FinanceExceptionCandidate = {
  exceptionType: FinanceExceptionType;
  referenceKey: string;
  /** What happened. */
  summary: string;
  /** Why it matters. */
  impact: string;
  /** What to do about it. Null when there is nothing beyond looking at it. */
  suggestedAction: string | null;
};

export type FinanceException = {
  id: string;
  businessId: string;
  exceptionType: FinanceExceptionType;
  referenceKey: string;
  summary: string;
  impact: string;
  suggestedAction: string | null;
  ownerId: string | null;
  status: FinanceExceptionStatus;
  resolutionNote: string | null;
  statusHistory: FinanceExceptionStatusHistoryEntry[];
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
