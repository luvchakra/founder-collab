/**
 * COMPLY-P0-07.5 (Return Review Workflow): "Draft -> Validate -> Review -> Approve ->
 * File." The persisted counterpart to COMPLY-P0-07.1/07.2/07.3's own schema-free "prepare"
 * functions -- see `supabase/migrations/20260912100000_gst_return_periods.sql`'s own
 * top-of-file comment for why this is the first table this epic needs and exactly what it
 * does and does not model (`ReturnDefinition`/`ReturnSubmission` are deliberately NOT
 * separate tables yet).
 */

export type ReturnType = "gstr1" | "gstr3b" | "gstr9";

export const RETURN_TYPES: ReturnType[] = ["gstr1", "gstr3b", "gstr9"];

/** The five stages this epic's own one-line spec names, in the only order a period may
 * move through them (see `transitions.ts`). */
export type ReturnPeriodStatus = "draft" | "validated" | "in_review" | "approved" | "filed";

export const RETURN_PERIOD_STATUSES: ReturnPeriodStatus[] = ["draft", "validated", "in_review", "approved", "filed"];

/** One entry per transition (including the implicit initial `"draft"` entry written at
 * creation) -- `gst.return_periods.status_history`'s own append-only audit trail, in place
 * of four separate `..._at`/`..._by` column pairs (see the migration's own docstring for
 * why). `by` is `null` only when the acting session had no resolvable user id (should not
 * happen in practice for an authenticated write, but never assumed non-null over an
 * unverified assumption). */
export type ReturnPeriodStatusHistoryEntry = {
  status: ReturnPeriodStatus;
  at: string;
  by: string | null;
};

/** The frozen return content captured at the draft -> validated transition -- opaque here
 * (whichever of `Gstr1Return`/`Gstr3bReturn`/`Gstr9Return` `computeReturnSnapshot`
 * computed for this period's own `returnType`, per `mutations.ts`). Kept as `unknown`
 * rather than a union of all three shapes: a caller reading a specific period already
 * knows its own `returnType` and can narrow accordingly; this module has no need to
 * discriminate the union itself. */
export type ReturnPeriodSnapshot = unknown;

export type ReturnPeriod = {
  id: string;
  businessId: string;
  returnType: ReturnType;
  periodStart: string;
  periodEnd: string;
  status: ReturnPeriodStatus;
  /** `null` only while `status === "draft"` -- `gst.return_periods`'s own check
   * constraint makes any other status structurally impossible without one. */
  snapshot: ReturnPeriodSnapshot | null;
  statusHistory: ReturnPeriodStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
};
