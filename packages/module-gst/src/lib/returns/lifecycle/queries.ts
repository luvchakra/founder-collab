import { createClient } from "../../../db/server";
import type { ReturnPeriod, ReturnPeriodStatusHistoryEntry, ReturnType } from "./types";

/** DB row -> `ReturnPeriod`, the only place snake_case/camelCase translation happens for
 * this table (mirrors every other `queries.ts` in this module). */
function mapRow(row: {
  id: string;
  business_id: string;
  return_type: string;
  period_start: string;
  period_end: string;
  status: string;
  snapshot: unknown;
  status_history: unknown;
  created_at: string;
  updated_at: string;
}): ReturnPeriod {
  return {
    id: row.id,
    businessId: row.business_id,
    returnType: row.return_type as ReturnType,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status as ReturnPeriod["status"],
    snapshot: row.snapshot ?? null,
    statusHistory: (row.status_history as ReturnPeriodStatusHistoryEntry[] | null) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const RETURN_PERIOD_COLUMNS = "id, business_id, return_type, period_start, period_end, status, snapshot, status_history, created_at, updated_at";

/** One return period by its own natural key -- the same key `getGstr1Return`/
 * `getGstr3bReturn`/`getGstr9Return` are already addressed by (business, return type,
 * period). `null` when no period has been created for this key yet (not every period a
 * business could prepare has necessarily been put through the review workflow). */
export async function getReturnPeriod(businessId: string, returnType: ReturnType, periodStart: string, periodEnd: string): Promise<ReturnPeriod | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("return_periods")
    .select(RETURN_PERIOD_COLUMNS)
    .eq("business_id", businessId)
    .eq("return_type", returnType)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/** One return period by its own id, with `businessId` enforced explicitly (not left to
 * RLS alone) -- same "never trust a client-supplied id without server-side authorization"
 * discipline `drilldown/queries.ts` already applies to a document id; here to a return
 * period id a caller (a server action handed an id from a form submission) supplied. */
export async function getReturnPeriodById(businessId: string, periodId: string): Promise<ReturnPeriod | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("return_periods")
    .select(RETURN_PERIOD_COLUMNS)
    .eq("business_id", businessId)
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/** Every return period for a business, optionally narrowed to one return type, newest
 * period first. */
export async function listReturnPeriods(businessId: string, returnType?: ReturnType): Promise<ReturnPeriod[]> {
  const supabase = await createClient();
  let query = supabase.from("return_periods").select(RETURN_PERIOD_COLUMNS).eq("business_id", businessId);
  if (returnType) query = query.eq("return_type", returnType);
  const { data, error } = await query.order("period_start", { ascending: false });
  if (error) throw error;
  return data.map(mapRow);
}
