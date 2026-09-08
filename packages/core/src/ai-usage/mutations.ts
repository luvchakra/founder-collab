import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../db/server";
import { estimateCost } from "../ai/client";
import { encryptApiKey, fingerprintApiKey } from "../crypto/api-key";
import { testProviderConnection } from "../ai-providers/test-connection";
import type { AiProvider } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/**
 * `core.ai_runs` is an append-only usage/cost ledger (S-4) -- mirrors
 * `module-discovery/lib/ai/usage.ts#recordAiRun` at the `business_id` grain instead of
 * `workspace_id`. Never let a logging failure break the caller's actual result.
 *
 * Defaults to the RLS-scoped server client; pass `client` (e.g. the admin client) for
 * an operation with no signed-in user.
 */
export async function recordAiRun(input: {
  businessId: string;
  operation: string;
  model: string;
  provider?: string;
  promptVersion: string;
  inputHash: string;
  inputTokens?: number;
  outputTokens?: number;
  searchCount?: number;
  durationMs?: number;
  status: "succeeded" | "failed";
  errorCode?: string;
  client?: SupabaseClient;
}): Promise<void> {
  const supabase = input.client ?? (await coreClient());
  const estimatedCost =
    input.inputTokens != null && input.outputTokens != null
      ? estimateCost(input.model, input.inputTokens, input.outputTokens)
      : null;

  const { error } = await supabase.from("ai_runs").insert({
    business_id: input.businessId,
    operation: input.operation,
    model: input.model,
    provider: input.provider ?? null,
    prompt_version: input.promptVersion,
    input_hash: input.inputHash,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    search_count: input.searchCount ?? null,
    estimated_cost: estimatedCost,
    duration_ms: input.durationMs ?? null,
    status: input.status,
    error_code: input.errorCode ?? null,
  });

  if (error) {
    console.error("Failed to record core.ai_runs entry:", error.message);
  }
}

/** Connects (or replaces) a business's single AI provider credential -- mirrors
 * `module-discovery/lib/ai-providers/mutations.ts#connectAiProvider` at the
 * `business_id` grain. Tests the key server-side before saving; a rejected key is never
 * persisted. */
export async function connectAiProvider(businessId: string, provider: AiProvider, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("API key is required.");

  const result = await testProviderConnection(provider, trimmed);
  if (!result.ok) throw new Error(result.error);

  const supabase = await coreClient();
  const { error } = await supabase.from("ai_provider_credentials").upsert(
    {
      business_id: businessId,
      provider,
      encrypted_api_key: encryptApiKey(trimmed),
      key_fingerprint: fingerprintApiKey(trimmed),
      status: "connected",
      last_validated_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "business_id" },
  );
  if (error) throw error;
}

export async function disconnectAiProvider(businessId: string): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase.from("ai_provider_credentials").delete().eq("business_id", businessId);
  if (error) throw error;
}
