import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { listUnpostedDocuments } from "../accounting/dashboard-queries";
import { getGstLedgerSummary } from "../accounting/gst-ledger-queries";
import { reconcileGst } from "../accounting/gst-ledger";
import { assessItc } from "../accounting/itc";
import { assessFilingReadiness } from "../accounting/filing-readiness";
import { listAccountingPeriods } from "../accounting/queries";
import { listBankAccounts, listBankTransactions } from "../accounting/banking-queries";
import { fiscalYearOf, monthlyPeriodsForFiscalYear, periodForDate } from "../accounting/periods";
import { getPurchaseRegister, getSalesRegister } from "../filing/queries";
import { getPurchaseReconciliation } from "../reconciliation/queries";
import { getActivationSettings } from "../activation/queries";
import { deriveFinanceExceptions } from "./derive";
import { getFinanceExceptionById, getFinanceExceptionByKey } from "./queries";
import type { FinanceException, FinanceExceptionStatus, FinanceExceptionStatusHistoryEntry } from "./types";

/**
 * FIN-1: the write paths onto `gst.finance_exceptions` -- `syncFinanceExceptions`
 * (additive-only, see the migration's own docstring for why) and the triage transitions a
 * human makes from there (`startReviewingFinanceException`, `resolveFinanceException`,
 * `ignoreFinanceException`, `reopenFinanceException`) plus `assignFinanceException`.
 */

async function currentUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Computes the current GST period's own signals the same way the GST ledger and filing
 * readiness pages already do (F7/F9's own query functions, not re-derived here), and syncs
 * them into the queue: inserts an `'open'` row for every candidate with no existing row
 * for its own natural key yet. Existing rows, whatever their own status, are never
 * touched -- a human's own triage decision is never silently overwritten by a re-sync.
 * Returns the full current queue so a caller doesn't need a second read to render it.
 */
export async function syncFinanceExceptions(businessId: string): Promise<FinanceException[]> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.exceptions.manage");

  const { fiscalYearStartMonth } = await getActivationSettings(businessId);
  const today = new Date().toISOString().slice(0, 10);
  const year = monthlyPeriodsForFiscalYear(fiscalYearOf(today, fiscalYearStartMonth), fiscalYearStartMonth);
  const selected = year.find((p) => p.startDate <= today && today <= p.endDate) ?? year[0]!;

  const [unposted, ledger, sales, purchases, twoB, periods, bankAccounts] = await Promise.all([
    listUnpostedDocuments(businessId),
    getGstLedgerSummary(businessId, selected.startDate, selected.endDate),
    getSalesRegister(businessId, selected.startDate, selected.endDate),
    getPurchaseRegister(businessId, selected.startDate, selected.endDate),
    getPurchaseReconciliation(businessId, selected.gstPeriod),
    listAccountingPeriods(businessId),
    listBankAccounts(businessId),
  ]);

  const reconciliation = reconcileGst(
    { output: ledger.output, input: ledger.input },
    { outputTax: sales.totalTax, inputTax: purchases.totalTax },
  );

  const itc = assessItc({
    ledger: ledger.input.total,
    register: purchases.totalTax,
    twoB: twoB ? twoB.rows.reduce((sum, row) => sum + (row.gstr2bTax ?? 0), 0) : 0,
    excludedNoGstin: twoB?.excludedNoGstinTaxableValue ?? 0,
    twoBAvailable: twoB !== null,
  });

  const bankLines = await Promise.all(bankAccounts.map((account) => listBankTransactions(businessId, account.id)));
  const unmatchedBankLines = bankLines
    .flat()
    .filter((line) => line.status === "unmatched" && line.txn_date >= selected.startDate && line.txn_date <= selected.endDate).length;

  const readiness = assessFilingReadiness({
    hasAccounts: ledger.hasAccounts,
    unpostedCount: unposted.filter((d) => d.doc_date >= selected.startDate && d.doc_date <= selected.endDate).length,
    ledgerAgreesWithReturn: reconciliation.agrees,
    ledgerReturnGap: reconciliation.largestGap,
    itcAtRisk: itc.atRisk,
    twoBImported: twoB !== null,
    invalidGstinCount: sales.b2b.filter((row) => !row.gstin).length,
    unmatchedBankLines,
    periodStatus: periodForDate(periods, selected.endDate)?.status ?? null,
  });

  const candidates = deriveFinanceExceptions({
    unposted,
    gstPeriod: selected.gstPeriod,
    // Without a chart of accounts there is no ledger to assess ITC risk against --
    // `assessItc` would report `risk: "unknown"` for the wrong reason (no 2B) rather than
    // the real one, and the `accounts` filing blocker already covers this case.
    itc: ledger.hasAccounts ? itc : null,
    blockers: readiness.blockers,
  });

  const supabase = await createClient();
  const results: FinanceException[] = [];

  for (const candidate of candidates) {
    const existing = await getFinanceExceptionByKey(businessId, candidate.exceptionType, candidate.referenceKey);
    if (existing) {
      results.push(existing);
      continue;
    }
    const { data, error } = await supabase
      .from("finance_exceptions")
      .insert({
        business_id: businessId,
        exception_type: candidate.exceptionType,
        reference_key: candidate.referenceKey,
        summary: candidate.summary,
        impact: candidate.impact,
        suggested_action: candidate.suggestedAction,
      })
      .select("id")
      .single();
    if (error) throw error;
    const created = await getFinanceExceptionById(businessId, data.id);
    if (!created) throw new Error("Exception was created but could not be read back.");
    results.push(created);
  }

  return results;
}

function historyEntry(status: FinanceExceptionStatus, note: string | null, by: string | null): FinanceExceptionStatusHistoryEntry {
  return { status, note, at: new Date().toISOString(), by };
}

/** `resolved` and `ignored` are terminal, matching this module's own terminal-once-decided
 * lifecycle rule (see `lib/exceptions/mutations.ts`). Unlike that simpler queue, this one
 * has a real working state (`in_review`) with a way back to `open` -- someone can start
 * looking at something and decide it needs to go back in the pool, e.g. to hand it to
 * someone else. */
const ALLOWED_TRANSITIONS: Record<FinanceExceptionStatus, FinanceExceptionStatus[]> = {
  open: ["in_review", "resolved", "ignored"],
  in_review: ["open", "resolved", "ignored"],
  resolved: [],
  ignored: [],
};

async function transitionFinanceException(businessId: string, exceptionId: string, to: FinanceExceptionStatus, note?: string): Promise<FinanceException> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.exceptions.manage");

  const trimmedNote = note?.trim();
  if (note !== undefined && !trimmedNote) {
    throw new Error("A note, if provided, cannot be blank.");
  }
  const noteValue = trimmedNote ?? null;

  const current = await getFinanceExceptionById(businessId, exceptionId);
  if (!current) throw new Error("Exception not found.");
  if (!ALLOWED_TRANSITIONS[current.status].includes(to)) {
    throw new Error(`This exception is "${current.status}" and cannot be moved to "${to}".`);
  }

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  const statusHistory = [...current.statusHistory, historyEntry(to, noteValue, userId)];
  const isTerminal = to === "resolved" || to === "ignored";

  const { error } = await supabase
    .from("finance_exceptions")
    .update({
      status: to,
      resolution_note: noteValue,
      status_history: statusHistory,
      resolved_by: isTerminal ? userId : null,
      resolved_at: isTerminal ? new Date().toISOString() : null,
    })
    .eq("business_id", businessId)
    .eq("id", exceptionId);
  if (error) throw error;

  const updated = await getFinanceExceptionById(businessId, exceptionId);
  if (!updated) throw new Error("Exception was updated but could not be read back.");
  return updated;
}

/** Someone has picked this up and is looking into it -- distinct from leaving it `open`
 * (nobody has started) so the queue can tell "flagged" from "being worked on" apart. */
export async function startReviewingFinanceException(businessId: string, exceptionId: string, note?: string): Promise<FinanceException> {
  return transitionFinanceException(businessId, exceptionId, "in_review", note);
}

/** Sent back to the pool -- someone started looking and it needs to go back, e.g. to hand
 * it to someone else. Only legal from `in_review`. */
export async function reopenFinanceException(businessId: string, exceptionId: string, note?: string): Promise<FinanceException> {
  return transitionFinanceException(businessId, exceptionId, "open", note);
}

/** The underlying issue was actually fixed (or confirmed correct). */
export async function resolveFinanceException(businessId: string, exceptionId: string, note?: string): Promise<FinanceException> {
  return transitionFinanceException(businessId, exceptionId, "resolved", note);
}

/** A human decided this doesn't need action -- distinct from `resolved` so a later
 * reviewer can tell "fixed" from "decided it was fine as-is" apart. */
export async function ignoreFinanceException(businessId: string, exceptionId: string, note?: string): Promise<FinanceException> {
  return transitionFinanceException(businessId, exceptionId, "ignored", note);
}

/** Hands (or unassigns) an exception to a business member -- independent of status, so
 * assigning something doesn't itself count as starting the review. */
export async function assignFinanceException(businessId: string, exceptionId: string, ownerId: string | null): Promise<FinanceException> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.exceptions.manage");

  const current = await getFinanceExceptionById(businessId, exceptionId);
  if (!current) throw new Error("Exception not found.");

  const supabase = await createClient();
  const { error } = await supabase.from("finance_exceptions").update({ owner_id: ownerId }).eq("business_id", businessId).eq("id", exceptionId);
  if (error) throw error;

  const updated = await getFinanceExceptionById(businessId, exceptionId);
  if (!updated) throw new Error("Exception was updated but could not be read back.");
  return updated;
}
