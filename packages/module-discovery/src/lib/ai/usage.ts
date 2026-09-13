import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../db/server";
import { estimateCost } from "@cofounderai/core/ai/client";

/**
 * ai_runs is an append-only usage/cost ledger (blueprint §9, §11) -- it does not store
 * results, only what an operation cost. Never let a logging failure break the caller's
 * actual result.
 *
 * Defaults to the RLS-scoped server client. Pass `client` (e.g. the admin client) for
 * operations with no logged-in user, such as the inbound-webhook-triggered reply
 * classification in lib/ai/classify-reply.ts.
 */
export async function recordAiRun(input: {
  workspaceId: string;
  operation: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Actual web searches used (usage.server_tool_use.web_search_requests), for
   * operations that call the web_search tool. Omit for everything else. */
  searchCount?: number;
  status: "succeeded" | "failed";
  client?: SupabaseClient;
  /** BYOK fields (docs/byok-ai-requirements.md §12) -- which account's own provider key
   * was billed, which provider actually served the request, how long it took, and a
   * machine-readable failure code (AiErrorCode from lib/ai/router.ts). Optional so
   * operations not yet routed through the BYOK router keep working unchanged. */
  accountId?: string;
  provider?: string;
  durationMs?: number;
  errorCode?: string;
}): Promise<string | null> {
  const supabase = input.client ?? (await createClient());
  const estimatedCost =
    input.inputTokens != null && input.outputTokens != null
      ? estimateCost(input.model, input.inputTokens, input.outputTokens)
      : null;

  // DISC-OFFER-P1 §7-03.2 "Research Cache": returns the inserted row's own id (null on
  // failure, same "never throw, just log" discipline this function already had) so a
  // caller that wants a durable, exact reference to "which ai_runs row produced this
  // specific cached result" -- e.g. `research-prospect.ts`'s own `ai_run_id` column --
  // can record it, rather than a caller re-deriving one loosely by operation+input_hash
  // later and risking a mismatch if a retry ever produced a second row for the same
  // input. Every existing caller already ignores this function's return value, so
  // adding one here is additive, not a breaking change.
  const { data, error } = await supabase
    .from("ai_runs")
    .insert({
      workspace_id: input.workspaceId,
      operation: input.operation,
      model: input.model,
      prompt_version: input.promptVersion,
      input_hash: input.inputHash,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      search_count: input.searchCount ?? null,
      estimated_cost: estimatedCost,
      status: input.status,
      account_id: input.accountId ?? null,
      provider: input.provider ?? null,
      duration_ms: input.durationMs ?? null,
      error_code: input.errorCode ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to record ai_runs entry:", error.message);
    return null;
  }
  return data.id;
}

/** DISC-OFFER-P0-14.1: "AI provider/model where applicable" for one Discovery Run History
 * entry -- every `ai_runs` row this workspace recorded while that run was in progress,
 * distinct `(operation, model, provider, status)` combinations only (a run's own
 * "Collect Signals"/"Research Top Opportunities" stages can each call this per account,
 * and a founder reviewing run history wants "which models/providers did this run use,"
 * not one row per account researched). Reuses the existing `discovery.ai_runs` usage
 * ledger directly, per this story's own "Reuse existing Core AI run/audit mechanisms
 * where appropriate" rather than duplicating provider/model onto `pipeline_runs` itself
 * -- see that table's own migration comment. `to: null` means "still running" -- every
 * `ai_runs` row from `from` onward, since the run's own true end time isn't known yet. */
export async function listAiRunsInWindow(
  workspaceId: string,
  from: string,
  to: string | null,
): Promise<{ operation: string; model: string; provider: string | null; status: "succeeded" | "failed" }[]> {
  const supabase = await createClient();
  let query = supabase
    .from("ai_runs")
    .select("operation, model, provider, status")
    .eq("workspace_id", workspaceId)
    .gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;

  const seen = new Set<string>();
  const distinct: { operation: string; model: string; provider: string | null; status: "succeeded" | "failed" }[] = [];
  for (const row of data) {
    const key = `${row.operation}::${row.model}::${row.provider ?? ""}::${row.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(row);
  }
  return distinct;
}
