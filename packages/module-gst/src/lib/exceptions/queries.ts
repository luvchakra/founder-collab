import { createClient } from "../../db/server";
import type { ExceptionStatus, ExceptionStatusHistoryEntry, ExceptionType, ReconciliationException } from "./types";

/** Deliberately NOT wrapped in React's `cache()` -- `mutations.ts` reads a row back
 * immediately after writing it within the same request, same reasoning every other
 * mutation-adjacent `queries.ts` in this module already documents. */

const EXCEPTION_COLUMNS =
  "id, business_id, return_period, exception_type, reference_key, summary, status, resolution_note, status_history, resolved_by, resolved_at, created_at, updated_at";

function mapRow(row: {
  id: string;
  business_id: string;
  return_period: string;
  exception_type: string;
  reference_key: string;
  summary: string;
  status: string;
  resolution_note: string | null;
  status_history: unknown;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}): ReconciliationException {
  return {
    id: row.id,
    businessId: row.business_id,
    returnPeriod: row.return_period,
    exceptionType: row.exception_type as ExceptionType,
    referenceKey: row.reference_key,
    summary: row.summary,
    status: row.status as ExceptionStatus,
    resolutionNote: row.resolution_note,
    statusHistory: (row.status_history as ExceptionStatusHistoryEntry[] | null) ?? [],
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every exception for a period, optionally narrowed to one status -- the shape an
 * exception-queue UI actually wants ("show me the open ones"). */
export async function listReconciliationExceptions(businessId: string, returnPeriod: string, status?: ExceptionStatus): Promise<ReconciliationException[]> {
  const supabase = await createClient();
  let query = supabase.from("reconciliation_exceptions").select(EXCEPTION_COLUMNS).eq("business_id", businessId).eq("return_period", returnPeriod);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at");
  if (error) throw error;
  return data.map(mapRow);
}

/** Every OPEN exception across every return period for a business -- COMPLY-P0-09.5's
 * (Risk Dashboard) own "Unmatched ITC" signal needs the whole open triage queue, not one
 * period at a time the way `listReconciliationExceptions` above requires. */
export async function listOpenReconciliationExceptions(businessId: string): Promise<ReconciliationException[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reconciliation_exceptions").select(EXCEPTION_COLUMNS).eq("business_id", businessId).eq("status", "open").order("created_at");
  if (error) throw error;
  return data.map(mapRow);
}

export async function getReconciliationExceptionById(businessId: string, exceptionId: string): Promise<ReconciliationException | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reconciliation_exceptions").select(EXCEPTION_COLUMNS).eq("business_id", businessId).eq("id", exceptionId).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function getReconciliationExceptionByKey(businessId: string, returnPeriod: string, exceptionType: ExceptionType, referenceKey: string): Promise<ReconciliationException | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reconciliation_exceptions")
    .select(EXCEPTION_COLUMNS)
    .eq("business_id", businessId)
    .eq("return_period", returnPeriod)
    .eq("exception_type", exceptionType)
    .eq("reference_key", referenceKey)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}
