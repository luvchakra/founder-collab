import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../../db/server";
import { getGstr1Return } from "../gstr1/queries";
import { getGstr3bReturn } from "../gstr3b/queries";
import { getGstr9Return } from "../gstr9/queries";
import { getUsSalesTaxReturn } from "../us-sales-tax/queries";
import { getReturnPeriod, getReturnPeriodById } from "./queries";
import { assertCanTransition } from "./transitions";
import type {
  ReturnPeriod,
  ReturnPeriodPaymentStatus,
  ReturnPeriodSnapshot,
  ReturnPeriodStatus,
  ReturnPeriodStatusHistoryEntry,
  ReturnType as GstReturnType,
} from "./types";

/**
 * COMPLY-P0-07.5 (Return Review Workflow): every write to `gst.return_periods` goes
 * through here -- `requireModule`/`requirePermission("gst.file_returns")` guard every
 * function (RLS backs the same check up regardless, per this platform's own four-layer
 * enforcement model), and every transition re-reads the period's own CURRENT status
 * immediately before writing rather than trusting a caller-supplied "I assume it's still
 * in review" status, so a stale UI or a concurrent transition by someone else is rejected
 * with a clear message (`assertCanTransition`) instead of silently skipping a stage or
 * clobbering it.
 */

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

async function currentUserId(supabase: SupabaseLike): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function historyEntry(status: ReturnPeriodStatus, by: string | null): ReturnPeriodStatusHistoryEntry {
  return { status, at: new Date().toISOString(), by };
}

/**
 * Computes the CURRENT prepared return content for a period's own return type -- exactly
 * what a "Draft" view of that return would show right now, via the same schema-free
 * preparer functions COMPLY-P0-07.1/07.2/07.3 already ship. Only called at the
 * draft -> validated transition (`validateReturnPeriod` below), where its result is frozen
 * into `snapshot` -- never re-computed afterwards, so an approved/filed period's own
 * snapshot reflects exactly what was reviewed, not whatever `core.documents` says today.
 */
async function computeReturnSnapshot(
  businessId: string,
  returnType: GstReturnType,
  jurisdiction: string | null,
  periodStart: string,
  periodEnd: string,
): Promise<ReturnPeriodSnapshot> {
  switch (returnType) {
    case "gstr1":
      return getGstr1Return(businessId, periodStart, periodEnd);
    case "gstr3b":
      return getGstr3bReturn(businessId, periodStart, periodEnd);
    case "gstr9":
      return getGstr9Return(businessId, periodStart, periodEnd);
    case "us_sales_tax":
      // gst.return_periods' own return_periods_us_sales_tax_requires_jurisdiction check
      // constraint already makes a null jurisdiction here structurally impossible for a
      // real row -- this guard is defense in depth, not the primary enforcement.
      if (!jurisdiction) throw new Error("A us_sales_tax return period must have a jurisdiction (US state).");
      return getUsSalesTaxReturn(businessId, jurisdiction, periodStart, periodEnd);
  }
}

/**
 * Starts the review workflow for one return period -- idempotent: if a period already
 * exists for this exact (business, return type, period) key, returns it unchanged rather
 * than erroring (the same unique key `gst.return_periods` itself enforces would otherwise
 * make a second call fail with a raw constraint-violation error for what a caller likely
 * meant as "make sure this period exists").
 */
export async function createReturnPeriod(
  businessId: string,
  returnType: GstReturnType,
  periodStart: string,
  periodEnd: string,
  jurisdiction: string | null = null,
): Promise<ReturnPeriod> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.file_returns");

  const existing = await getReturnPeriod(businessId, returnType, periodStart, periodEnd, jurisdiction);
  if (existing) return existing;

  const supabase = await createClient();
  const userId = await currentUserId(supabase);

  const { data, error } = await supabase
    .from("return_periods")
    .insert({
      business_id: businessId,
      return_type: returnType,
      jurisdiction,
      period_start: periodStart,
      period_end: periodEnd,
      status_history: [historyEntry("draft", userId)],
    })
    .select("id")
    .single();
  if (error) throw error;

  const created = await getReturnPeriodById(businessId, data.id);
  if (!created) throw new Error("Return period was created but could not be read back.");
  return created;
}

async function transition(businessId: string, periodId: string, to: ReturnPeriodStatus, extraColumns?: Record<string, unknown>): Promise<ReturnPeriod> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.file_returns");

  const current = await getReturnPeriodById(businessId, periodId);
  if (!current) throw new Error("Return period not found.");
  assertCanTransition(current.status, to);

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  const statusHistory = [...current.statusHistory, historyEntry(to, userId)];

  const { error } = await supabase
    .from("return_periods")
    .update({ status: to, status_history: statusHistory, ...extraColumns })
    .eq("business_id", businessId)
    .eq("id", periodId);
  if (error) throw error;

  const updated = await getReturnPeriodById(businessId, periodId);
  if (!updated) throw new Error("Return period was updated but could not be read back.");
  return updated;
}

/**
 * draft -> validated: freezes the CURRENT prepared return content into `snapshot`
 * (`computeReturnSnapshot` above). From this point on, this period's own review reflects
 * exactly this snapshot, never a live re-computation -- COMPLY-P0-07.6 (Return Lock) is
 * the story that will make this genuinely tamper-proof at the database layer once
 * approved/filed; this story does not yet add that DB-level guard (see its own
 * docstring/audit-log entry).
 */
export async function validateReturnPeriod(businessId: string, periodId: string): Promise<ReturnPeriod> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.file_returns");

  const current = await getReturnPeriodById(businessId, periodId);
  if (!current) throw new Error("Return period not found.");
  assertCanTransition(current.status, "validated");

  const snapshot = await computeReturnSnapshot(businessId, current.returnType, current.jurisdiction, current.periodStart, current.periodEnd);
  return transition(businessId, periodId, "validated", { snapshot });
}

/** validated -> in_review: sends an already-validated period to a reviewer. No content
 * change -- the snapshot frozen at `validateReturnPeriod` is exactly what a reviewer sees. */
export async function submitReturnPeriodForReview(businessId: string, periodId: string): Promise<ReturnPeriod> {
  return transition(businessId, periodId, "in_review");
}

/** in_review -> approved: a reviewer signs off. Still an internal approval, not a claim
 * that the return has been filed with the government -- that is the next, separate stage. */
export async function approveReturnPeriod(businessId: string, periodId: string): Promise<ReturnPeriod> {
  return transition(businessId, periodId, "approved");
}

/**
 * approved -> filed: records that this return period has been filed. This function does
 * NOT itself submit anything to a government system -- there is no GSTN return-filing API
 * this platform drives end-to-end (unlike e-invoice/e-way-bill, which have a real IRP/GSP
 * adapter, COMPLY-P0-05.3/06.3) -- a real GSTR-1/3B/9 filing happens on the GSTN portal,
 * DSC/EVC-signed by the taxpayer, outside this platform. This is the internal "we filed
 * this" record for that already-happened, human-authorized external action, per backlog
 * rule 11's own "filing/submission is a consequential external action requiring explicit
 * user authorization" -- never inferred, never automated.
 *
 * `filingReference` (COMPLY-P0-07.7) is the ARN the GST Portal issued for that filing --
 * optional, since it may not be on hand the instant this is called (recorded moments after
 * DSC/EVC submission, before the confirmation page loads) but typically available right
 * away in practice. Once this period is already `"filed"` (a LATER call, not this one),
 * `gst.enforce_return_period_lock` makes `filingReference`/`filedAt` permanently
 * immutable -- a real ARN, once on file, is never silently overwritten.
 */
export async function markReturnPeriodFiled(businessId: string, periodId: string, filingReference?: string): Promise<ReturnPeriod> {
  const trimmed = filingReference?.trim();
  if (filingReference !== undefined && !trimmed) {
    throw new Error("A filing reference, if provided, cannot be blank.");
  }
  return transition(businessId, periodId, "filed", {
    filing_reference: trimmed ?? null,
    filed_at: new Date().toISOString(),
  });
}

/**
 * COMPLY-P0-07.7 (Filing/Payment Status): records the tax payment associated with a
 * return period -- a human-reported fact (a CIN, an amount, a date), never a live payment
 * status FETCH (this backlog has no GSTN payment API adapter). Callable at ANY point in
 * the period's own review-workflow status, not gated by `transitions.ts`'s own state
 * machine at all -- payment is an orthogonal fact about the period, not another stage of
 * Draft->Validate->Review->Approve->File (most realistically recorded around the same time
 * as filing for a GSTR-3B period, but this function does not assume that timing).
 *
 * Rejects moving `status` backward AWAY from `"paid"` here too (defense in depth on top of
 * `gst.enforce_return_period_lock`'s own database-level guard, matching how every other
 * mutation in this module double-checks what its own RLS/trigger layer already enforces) --
 * a payment marked paid is a settled fact and this function will not silently "un-pay" it.
 */
export async function recordReturnPeriodPayment(
  businessId: string,
  periodId: string,
  input: { status: ReturnPeriodPaymentStatus; reference?: string; amount?: number; date?: string },
): Promise<ReturnPeriod> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.file_returns");

  const current = await getReturnPeriodById(businessId, periodId);
  if (!current) throw new Error("Return period not found.");
  if (current.paymentStatus === "paid" && input.status !== "paid") {
    throw new Error(`This period's payment is already marked "paid" and cannot be changed to "${input.status}".`);
  }

  const reference = input.reference?.trim();
  if (input.reference !== undefined && !reference) {
    throw new Error("A payment reference, if provided, cannot be blank.");
  }
  if (input.amount !== undefined && input.amount < 0) {
    throw new Error("A payment amount cannot be negative.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("return_periods")
    .update({
      payment_status: input.status,
      payment_reference: reference ?? null,
      payment_amount: input.amount ?? null,
      payment_date: input.date ?? null,
    })
    .eq("business_id", businessId)
    .eq("id", periodId);
  if (error) throw error;

  const updated = await getReturnPeriodById(businessId, periodId);
  if (!updated) throw new Error("Return period was updated but could not be read back.");
  return updated;
}
