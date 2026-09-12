import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { getPurchaseReconciliation } from "../reconciliation/queries";
import { getItcAvailability } from "../itc/queries";
import { deriveReconciliationExceptions } from "./derive";
import { getReconciliationExceptionByKey, getReconciliationExceptionById } from "./queries";
import type { ExceptionStatus, ExceptionStatusHistoryEntry, ReconciliationException } from "./types";

/**
 * COMPLY-P0-08.6: the two write paths onto `gst.reconciliation_exceptions` --
 * `syncReconciliationExceptions` (additive-only, see the migration's own docstring for
 * why) and `resolveException`/`dismissException` (a human's own triage decision).
 */

async function currentUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Computes this period's own current candidates (reusing COMPLY-P0-08.2's/08.5's own
 * already-built query functions -- no re-derivation of reconciliation/ITC logic here) and
 * inserts an `'open'` row for every candidate that has no existing row at all yet.
 * Existing rows (whatever their own status) are never touched -- see the migration's own
 * docstring for why. Returns every candidate row that now exists (freshly inserted or
 * already on file), so a caller doesn't need a second read to render the current queue.
 */
export async function syncReconciliationExceptions(businessId: string, returnPeriod: string): Promise<ReconciliationException[]> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.manage_reconciliation");

  const [reconciliation, itc] = await Promise.all([getPurchaseReconciliation(businessId, returnPeriod), getItcAvailability(businessId, returnPeriod)]);
  if (!reconciliation) return [];

  const candidates = deriveReconciliationExceptions(reconciliation, itc);
  const supabase = await createClient();
  const results: ReconciliationException[] = [];

  for (const candidate of candidates) {
    const existing = await getReconciliationExceptionByKey(businessId, returnPeriod, candidate.exceptionType, candidate.referenceKey);
    if (existing) {
      results.push(existing);
      continue;
    }
    const { data, error } = await supabase
      .from("reconciliation_exceptions")
      .insert({
        business_id: businessId,
        return_period: returnPeriod,
        exception_type: candidate.exceptionType,
        reference_key: candidate.referenceKey,
        summary: candidate.summary,
      })
      .select("id")
      .single();
    if (error) throw error;
    const created = await getReconciliationExceptionById(businessId, data.id);
    if (!created) throw new Error("Exception was created but could not be read back.");
    results.push(created);
  }

  return results;
}

function historyEntry(status: ExceptionStatus, note: string | null, by: string | null): ExceptionStatusHistoryEntry {
  return { status, note, at: new Date().toISOString(), by };
}

async function transitionException(businessId: string, exceptionId: string, to: "resolved" | "dismissed", note?: string): Promise<ReconciliationException> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.manage_reconciliation");

  const trimmedNote = note?.trim();
  if (note !== undefined && !trimmedNote) {
    throw new Error("A resolution note, if provided, cannot be blank.");
  }
  const noteValue = trimmedNote ?? null;

  const current = await getReconciliationExceptionById(businessId, exceptionId);
  if (!current) throw new Error("Exception not found.");
  if (current.status !== "open") {
    throw new Error(`This exception is already "${current.status}" and cannot be changed to "${to}".`);
  }

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  const statusHistory = [...current.statusHistory, historyEntry(to, noteValue, userId)];

  const { error } = await supabase
    .from("reconciliation_exceptions")
    .update({ status: to, resolution_note: noteValue, status_history: statusHistory, resolved_by: userId, resolved_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", exceptionId);
  if (error) throw error;

  const updated = await getReconciliationExceptionById(businessId, exceptionId);
  if (!updated) throw new Error("Exception was updated but could not be read back.");
  return updated;
}

/** A human has investigated and fixed (or confirmed there was nothing wrong with) the
 * underlying issue -- only legal from `'open'`, matching the terminal-once-decided shape
 * every other lifecycle mutation in this module already follows. Reopening a resolved/
 * dismissed exception is a real, plausible future need, deliberately not built here. */
export async function resolveException(businessId: string, exceptionId: string, note?: string): Promise<ReconciliationException> {
  return transitionException(businessId, exceptionId, "resolved", note);
}

/** A human has decided this exception doesn't need action (e.g. a known, accepted
 * timing difference) -- distinct from `resolved` (something was actually fixed/
 * confirmed correct) so a later reviewer can tell the two apart. */
export async function dismissException(businessId: string, exceptionId: string, note?: string): Promise<ReconciliationException> {
  return transitionException(businessId, exceptionId, "dismissed", note);
}
