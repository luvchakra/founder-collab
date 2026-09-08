import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../db/server";
import type { AiProviderConnection, BusinessAiUsage } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Aggregates the current calendar month's usage straight from `ai_runs` (S-4's
 * append-only ledger) -- mirrors `module-discovery/lib/usage/queries.ts#getWorkspaceUsage`
 * at the `business_id` grain instead of `workspace_id`. Defaults to the RLS-scoped
 * server client; pass `client` (e.g. the admin client) for a caller with no signed-in
 * user.
 */
export const getBusinessAiUsage = cache(async function getBusinessAiUsage(
  businessId: string,
  client?: SupabaseClient,
): Promise<BusinessAiUsage> {
  const supabase = client ?? (await coreClient());
  const { start, end } = currentMonthRange();

  const { data, error } = await supabase
    .from("ai_runs")
    .select("operation, estimated_cost")
    .eq("business_id", businessId)
    .eq("status", "succeeded")
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) throw error;

  const byOperationMap = new Map<string, { runs: number; cost: number }>();
  for (const row of data) {
    const entry = byOperationMap.get(row.operation) ?? { runs: 0, cost: 0 };
    entry.runs += 1;
    entry.cost += row.estimated_cost ?? 0;
    byOperationMap.set(row.operation, entry);
  }

  const byOperation = Array.from(byOperationMap.entries())
    .map(([operation, v]) => ({ operation, runs: v.runs, cost: v.cost }))
    .sort((a, b) => b.cost - a.cost);

  return {
    businessId,
    periodStart: start,
    periodEnd: end,
    byOperation,
    totalCost: byOperation.reduce((sum, op) => sum + op.cost, 0),
  };
});

/** Non-secret connection status only -- mirrors
 * `module-discovery/lib/ai-providers/queries.ts#getAiProviderConnection`; never selects
 * `encrypted_api_key`. */
export const getAiProviderConnection = cache(async (businessId: string): Promise<AiProviderConnection | null> => {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("ai_provider_credentials")
    .select("provider, key_fingerprint, status, last_validated_at, last_error")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    provider: data.provider,
    keyFingerprint: data.key_fingerprint,
    status: data.status,
    lastValidatedAt: data.last_validated_at,
    lastError: data.last_error,
  };
});
