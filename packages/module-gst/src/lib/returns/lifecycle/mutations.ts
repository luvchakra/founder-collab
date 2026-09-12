import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../../db/server";
import { getGstr1Return } from "../gstr1/queries";
import { getGstr3bReturn } from "../gstr3b/queries";
import { getGstr9Return } from "../gstr9/queries";
import { getReturnPeriod, getReturnPeriodById } from "./queries";
import { assertCanTransition } from "./transitions";
import type {
  ReturnPeriod,
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
async function computeReturnSnapshot(businessId: string, returnType: GstReturnType, periodStart: string, periodEnd: string): Promise<ReturnPeriodSnapshot> {
  switch (returnType) {
    case "gstr1":
      return getGstr1Return(businessId, periodStart, periodEnd);
    case "gstr3b":
      return getGstr3bReturn(businessId, periodStart, periodEnd);
    case "gstr9":
      return getGstr9Return(businessId, periodStart, periodEnd);
  }
}

/**
 * Starts the review workflow for one return period -- idempotent: if a period already
 * exists for this exact (business, return type, period) key, returns it unchanged rather
 * than erroring (the same unique key `gst.return_periods` itself enforces would otherwise
 * make a second call fail with a raw constraint-violation error for what a caller likely
 * meant as "make sure this period exists").
 */
export async function createReturnPeriod(businessId: string, returnType: GstReturnType, periodStart: string, periodEnd: string): Promise<ReturnPeriod> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.file_returns");

  const existing = await getReturnPeriod(businessId, returnType, periodStart, periodEnd);
  if (existing) return existing;

  const supabase = await createClient();
  const userId = await currentUserId(supabase);

  const { data, error } = await supabase
    .from("return_periods")
    .insert({
      business_id: businessId,
      return_type: returnType,
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

  const snapshot = await computeReturnSnapshot(businessId, current.returnType, current.periodStart, current.periodEnd);
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
 * user authorization" -- never inferred, never automated. COMPLY-P0-07.7's own "Filing/
 * Payment Status" is where richer metadata about that filing (an ARN, a payment/challan
 * reference) belongs; this story only marks that the stage was reached and by whom.
 */
export async function markReturnPeriodFiled(businessId: string, periodId: string): Promise<ReturnPeriod> {
  return transition(businessId, periodId, "filed");
}
