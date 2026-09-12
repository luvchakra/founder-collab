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

/** COMPLY-P0-07.7 (Filing/Payment Status): whether a payment associated with this return
 * period has been recorded. `"not_applicable"` (the default for every return type) is a
 * real, correct answer, not a placeholder for "unknown" -- most return types (GSTR-1,
 * GSTR-9) carry no tax-payment obligation of their own; only GSTR-3B periods realistically
 * ever move past it. Forward-only once `"paid"`, mirrored by a real database-level lock
 * (`gst.enforce_return_period_lock`, extended by this story) -- a completed payment's own
 * reference/amount/date can never be silently rewritten, the same "protect a settled fact"
 * rule COMPLY-P0-07.6 already applies to an approved/filed return's own content. */
export type ReturnPeriodPaymentStatus = "not_applicable" | "pending" | "paid";

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
  /** COMPLY-P0-07.7: the ARN (Acknowledgement/Application Reference Number) the real GST
   * Portal issues on successful filing -- recorded here as a human-reported fact, never
   * fetched live (this backlog has no GSTN filing-status API adapter). `null` until
   * recorded; may be set at the same moment as the draft->...->filed transition, or added
   * shortly after. Immutable once this period is already `"filed"` and this field has a
   * value (see the migration's own lock trigger). */
  filingReference: string | null;
  /** COMPLY-P0-07.7: when the filing was recorded -- a first-class, queryable column
   * rather than something only recoverable by parsing `statusHistory`'s own jsonb array. */
  filedAt: string | null;
  paymentStatus: ReturnPeriodPaymentStatus;
  /** COMPLY-P0-07.7: the CIN (Challan Identification Number) the collecting bank issues
   * once a tax payment is actually realized -- distinct from a CPIN (issued when a challan
   * is merely CREATED, before payment), which this table does not track. */
  paymentReference: string | null;
  paymentAmount: number | null;
  paymentDate: string | null;
  createdAt: string;
  updatedAt: string;
};
