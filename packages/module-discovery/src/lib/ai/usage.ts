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
}) {
  const supabase = input.client ?? (await createClient());
  const estimatedCost =
    input.inputTokens != null && input.outputTokens != null
      ? estimateCost(input.model, input.inputTokens, input.outputTokens)
      : null;

  const { error } = await supabase.from("ai_runs").insert({
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
  });

  if (error) {
    console.error("Failed to record ai_runs entry:", error.message);
  }
}
