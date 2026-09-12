/**
 * COMPLY-P0-08.6 (Exception Queue) -- see
 * `supabase/migrations/20260912170000_gst_reconciliation_exceptions.sql`'s own docstring
 * for the full scope/design research trail.
 */

export type ExceptionType = "supplier_mismatch" | "missing_in_2b" | "missing_in_books" | "ims_pending";

export const EXCEPTION_TYPES: ExceptionType[] = ["supplier_mismatch", "missing_in_2b", "missing_in_books", "ims_pending"];

export type ExceptionStatus = "open" | "resolved" | "dismissed";

export type ExceptionStatusHistoryEntry = {
  status: ExceptionStatus;
  note: string | null;
  at: string;
  by: string | null;
};

/** A candidate exception derived from a fresh reconciliation/ITC computation --
 * `derive.ts`'s own output, before it's ever compared against what's already persisted.
 * Not yet a real `ReconciliationException` row (no id, no status). */
export type ExceptionCandidate = {
  exceptionType: ExceptionType;
  referenceKey: string;
  summary: string;
};

export type ReconciliationException = {
  id: string;
  businessId: string;
  returnPeriod: string;
  exceptionType: ExceptionType;
  referenceKey: string;
  summary: string;
  status: ExceptionStatus;
  resolutionNote: string | null;
  statusHistory: ExceptionStatusHistoryEntry[];
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
