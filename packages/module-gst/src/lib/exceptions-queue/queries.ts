import { createClient } from "../../db/server";
import type { FinanceException, FinanceExceptionStatus, FinanceExceptionStatusHistoryEntry, FinanceExceptionType } from "./types";

/** Deliberately NOT wrapped in React's `cache()` -- `mutations.ts` reads a row back
 * immediately after writing it within the same request, same reasoning every other
 * mutation-adjacent `queries.ts` in this module already documents. */

const EXCEPTION_COLUMNS =
  "id, business_id, exception_type, reference_key, summary, impact, suggested_action, owner_id, status, resolution_note, status_history, resolved_by, resolved_at, created_at, updated_at";

function mapRow(row: {
  id: string;
  business_id: string;
  exception_type: string;
  reference_key: string;
  summary: string;
  impact: string;
  suggested_action: string | null;
  owner_id: string | null;
  status: string;
  resolution_note: string | null;
  status_history: unknown;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}): FinanceException {
  return {
    id: row.id,
    businessId: row.business_id,
    exceptionType: row.exception_type as FinanceExceptionType,
    referenceKey: row.reference_key,
    summary: row.summary,
    impact: row.impact,
    suggestedAction: row.suggested_action,
    ownerId: row.owner_id,
    status: row.status as FinanceExceptionStatus,
    resolutionNote: row.resolution_note,
    statusHistory: (row.status_history as FinanceExceptionStatusHistoryEntry[] | null) ?? [],
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The whole queue for a business, optionally narrowed to one status -- oldest first, so
 * the queue reads in the order things were first flagged. */
export async function listFinanceExceptions(businessId: string, status?: FinanceExceptionStatus): Promise<FinanceException[]> {
  const supabase = await createClient();
  let query = supabase.from("finance_exceptions").select(EXCEPTION_COLUMNS).eq("business_id", businessId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at");
  if (error) throw error;
  return data.map(mapRow);
}

/** Every OPEN or IN_REVIEW exception -- the count a nav badge or dashboard card wants,
 * without pulling in rows already triaged away. */
export async function countActiveFinanceExceptions(businessId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("finance_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .in("status", ["open", "in_review"]);
  if (error) throw error;
  return count ?? 0;
}

export async function getFinanceExceptionById(businessId: string, exceptionId: string): Promise<FinanceException | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("finance_exceptions").select(EXCEPTION_COLUMNS).eq("business_id", businessId).eq("id", exceptionId).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function getFinanceExceptionByKey(businessId: string, exceptionType: FinanceExceptionType, referenceKey: string): Promise<FinanceException | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finance_exceptions")
    .select(EXCEPTION_COLUMNS)
    .eq("business_id", businessId)
    .eq("exception_type", exceptionType)
    .eq("reference_key", referenceKey)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}
