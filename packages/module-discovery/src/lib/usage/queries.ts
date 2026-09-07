import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../db/server";
import { listProducts, listWorkspacesForProducts } from "../tenancy/queries";
import type { BusinessUsage, WorkspaceUsage } from "./types";

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Aggregates the current calendar month's usage straight from ai_runs (blueprint §9's
 * append-only ledger) rather than a separate rollup table -- the ledger is small enough
 * per workspace at MVP scale to aggregate on read.
 *
 * Defaults to the RLS-scoped server client. Pass `client` (the admin client) for callers
 * with no logged-in user, e.g. classifyReply's usage check, which runs from the inbound
 * webhook.
 */
export const getWorkspaceUsage = cache(async function getWorkspaceUsage(
  workspaceId: string,
  client?: SupabaseClient,
): Promise<WorkspaceUsage> {
  const supabase = client ?? (await createClient());
  const { start, end } = currentMonthRange();

  const { data, error } = await supabase
    .from("ai_runs")
    .select("operation, estimated_cost")
    .eq("workspace_id", workspaceId)
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
    workspaceId,
    periodStart: start,
    periodEnd: end,
    totalRuns: data.length,
    totalCost: byOperation.reduce((sum, o) => sum + o.cost, 0),
    byOperation,
  };
});

/**
 * Same aggregation as getWorkspaceUsage, batched across every workspace at once -- one
 * round trip instead of one per workspace. Used by the dashboard, which otherwise sums
 * this across every workspace on the account; RLS still filters every row exactly as it
 * would per-workspace, so batching only changes round-trip count, never who can see what.
 */
export async function getWorkspaceUsageForWorkspaces(
  workspaceIds: string[],
): Promise<Record<string, WorkspaceUsage>> {
  const result: Record<string, WorkspaceUsage> = {};
  if (workspaceIds.length === 0) return result;

  const supabase = await createClient();
  const { start, end } = currentMonthRange();

  const { data, error } = await supabase
    .from("ai_runs")
    .select("workspace_id, operation, estimated_cost")
    .in("workspace_id", workspaceIds)
    .eq("status", "succeeded")
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) throw error;

  const byWorkspaceOperation = new Map<string, Map<string, { runs: number; cost: number }>>();
  for (const row of data) {
    const byOperationMap =
      byWorkspaceOperation.get(row.workspace_id) ?? new Map<string, { runs: number; cost: number }>();
    byWorkspaceOperation.set(row.workspace_id, byOperationMap);
    const entry = byOperationMap.get(row.operation) ?? { runs: 0, cost: 0 };
    entry.runs += 1;
    entry.cost += row.estimated_cost ?? 0;
    byOperationMap.set(row.operation, entry);
  }

  for (const workspaceId of workspaceIds) {
    const byOperationMap = byWorkspaceOperation.get(workspaceId) ?? new Map();
    const byOperation = Array.from(byOperationMap.entries())
      .map(([operation, v]) => ({ operation, runs: v.runs, cost: v.cost }))
      .sort((a, b) => b.cost - a.cost);
    result[workspaceId] = {
      workspaceId,
      periodStart: start,
      periodEnd: end,
      totalRuns: byOperation.reduce((sum, o) => sum + o.runs, 0),
      totalCost: byOperation.reduce((sum, o) => sum + o.cost, 0),
      byOperation,
    };
  }
  return result;
}

/**
 * Discovery's own usage rolled up across every product/workspace under one business --
 * the "Discovery" section of the business-level, per-module AI usage page
 * (apps/web/.../businesses/[businessId]/usage). AI usage is inherently workspace-scoped
 * (discovery.ai_runs, keyed by workspace_id, per co-founder-ai's original single-module
 * design -- ADR-3's aspiration of a shared core.ai_runs table hasn't been built yet,
 * since no other module calls an LLM at all today), so "this business's discovery usage"
 * means summing every one of its products' own workspace ledgers, not a single row.
 */
export async function getBusinessUsage(businessId: string): Promise<BusinessUsage> {
  const products = await listProducts(businessId);
  const workspaces = await listWorkspacesForProducts(products.map((p) => p.id));
  const usageByWorkspace = await getWorkspaceUsageForWorkspaces(workspaces.map((w) => w.id));
  const { start, end } = currentMonthRange();

  const byOperationMap = new Map<string, { runs: number; cost: number }>();
  for (const usage of Object.values(usageByWorkspace)) {
    for (const op of usage.byOperation) {
      const entry = byOperationMap.get(op.operation) ?? { runs: 0, cost: 0 };
      entry.runs += op.runs;
      entry.cost += op.cost;
      byOperationMap.set(op.operation, entry);
    }
  }

  const byOperation = Array.from(byOperationMap.entries())
    .map(([operation, v]) => ({ operation, runs: v.runs, cost: v.cost }))
    .sort((a, b) => b.cost - a.cost);

  return {
    businessId,
    periodStart: start,
    periodEnd: end,
    totalRuns: byOperation.reduce((sum, o) => sum + o.runs, 0),
    totalCost: byOperation.reduce((sum, o) => sum + o.cost, 0),
    byOperation,
  };
}
