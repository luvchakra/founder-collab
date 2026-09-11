import type { SupabaseClient } from "@supabase/supabase-js";
import { APICallError, NoObjectGeneratedError, RetryError, type LanguageModel } from "ai";
import { createClient } from "../db/server";
import { decryptApiKey } from "../crypto/api-key";
import { resolveModelId, type AiProvider, type AiQualityTier } from "./model-registry";
import { getOperationSpec, type AiOperation } from "./operation-registry";
import { createLanguageModel } from "./provider-factory";

/**
 * The `business_id`-scoped counterpart to `module-discovery/lib/ai/router.ts`
 * (`resolveAiModelForAccount` there, keyed by `account_id`) -- CRM-08.6's own first
 * caller from outside module-discovery of `core.ai_provider_credentials`/`core.ai_runs`
 * (S-4, `20260908140000_core_ai_usage.sql`), which existed as unused, forward-only
 * infrastructure precisely so "any future non-discovery module that calls an LLM" would
 * have a shared path rather than reinventing its own. This file, not discovery's own
 * router.ts, is that shared path: any `business_id`-tenanted module (fsm/inventory/gst,
 * crm today) resolves its model through here, never by importing discovery's internals
 * (CLAUDE.md's architecture rule 3 forbids that anyway) and never by calling a provider
 * SDK directly (the root CLAUDE.md's own AI rule: "called only through a lib/ai-
 * equivalent inside packages/core or module-discovery, never directly from routes or
 * components").
 *
 * Deliberately a near-duplicate of discovery's router rather than a shared refactor of
 * both into one file: discovery's own router is working, tested code this story has no
 * reason to touch (CLAUDE.md principle 10, "do not refactor unrelated code"), and the
 * two differ in real ways (account_id vs. business_id, a workspace lookup step
 * discovery needs that this doesn't) that would make a forced merge messier than the
 * duplication it would save.
 */

export type AiErrorCode =
  | "no_provider_connected"
  | "invalid_key"
  | "rate_limited"
  | "model_unavailable"
  | "provider_unavailable"
  | "timeout"
  | "invalid_response"
  | "unknown";

export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  readonly provider?: AiProvider;

  constructor(code: AiErrorCode, message: string, provider?: AiProvider, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "AiProviderError";
    this.code = code;
    this.provider = provider;
  }
}

export type ResolvedBusinessAiModel = {
  businessId: string;
  provider: AiProvider;
  modelId: string;
  model: LanguageModel;
  /** "byok" when running on the business's own connected key, "platform" when falling
   * back to the platform's included credit (`PLATFORM_AI_API_KEY`) -- same env var and
   * same fallback story `module-discovery/lib/ai/router.ts#getPlatformCredential`
   * already established; it is a deployment-wide credential, not a discovery-specific
   * one, so reusing it here needs no new secret. */
  credentialSource: "byok" | "platform";
};

function getPlatformCredential(): { provider: AiProvider; apiKey: string } | null {
  const apiKey = process.env.PLATFORM_AI_API_KEY;
  if (!apiKey) return null;
  return { provider: "anthropic", apiKey };
}

type ProviderCredentialRow = { provider: AiProvider; encrypted_api_key: string };

/** Selects only what the router needs to build a request -- mirrors discovery's own
 * router's restriction on where `encrypted_api_key` is ever read from. Defaults to the
 * RLS-scoped server client against `core`; pass `client` for a caller with no session. */
async function getProviderCredential(businessId: string, client?: SupabaseClient): Promise<ProviderCredentialRow | null> {
  const supabase = client ?? (await createClient({ schema: "core" }));
  const { data, error } = await supabase
    .from("ai_provider_credentials")
    .select("provider, encrypted_api_key")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Resolves the language model a business-scoped AI operation should use: the business's
 * own connected BYOK credential (`core.ai_provider_credentials`) first, falling back to
 * the platform's included credit if the deployment has one configured. Throws
 * `AiProviderError("no_provider_connected")` only when neither is available.
 */
export async function resolveBusinessAiModel(businessId: string, operation: AiOperation, client?: SupabaseClient): Promise<ResolvedBusinessAiModel> {
  const byokCredential = await getProviderCredential(businessId, client);
  const credential: { provider: AiProvider; apiKey: string } | null = byokCredential
    ? { provider: byokCredential.provider, apiKey: decryptApiKey(byokCredential.encrypted_api_key) }
    : getPlatformCredential();
  if (!credential) {
    throw new AiProviderError("no_provider_connected", "Connect an AI provider before using this feature.");
  }

  const spec = getOperationSpec(operation);
  const modelId = resolveModelId(credential.provider, spec.qualityTier);
  const model = createLanguageModel(credential.provider, credential.apiKey, modelId, { webSearch: spec.requiresWebSearch });

  return {
    businessId,
    provider: credential.provider,
    modelId,
    model,
    credentialSource: byokCredential ? "byok" : "platform",
  };
}

/** Same classification discovery's own `toAiProviderError` applies, minus the two error
 * codes (`url_retrieval_failed`, `no_content_found`) that only ever arise from
 * discovery's own website-research operations -- no business-scoped operation performs
 * that kind of call. */
export function toAiProviderError(error: unknown, provider: AiProvider): AiProviderError {
  if (error instanceof AiProviderError) return error;

  console.error(`[ai/business-router] ${provider} request failed:`, error);

  const cause = RetryError.isInstance(error) ? (error.lastError ?? error) : error;
  const detail = cause instanceof Error && cause.message ? ` (${cause.message})` : "";

  if (APICallError.isInstance(cause)) {
    const status = cause.statusCode;
    if (status === 401 || status === 403) {
      return new AiProviderError("invalid_key", `Your ${provider} API key could not complete this request.${detail}`, provider, error);
    }
    if (status === 429) {
      return new AiProviderError("rate_limited", `Your ${provider} account hit a rate limit or quota cap.${detail}`, provider, error);
    }
    if (status === 404) {
      return new AiProviderError("model_unavailable", `The model this feature needs isn't available on your ${provider} account.${detail}`, provider, error);
    }
    if (status !== undefined && status >= 500) {
      return new AiProviderError("provider_unavailable", `${provider} is currently unavailable. Try again shortly.${detail}`, provider, error);
    }
    return new AiProviderError("unknown", `Your request to ${provider} could not be completed.${detail}`, provider, error);
  }

  if (cause instanceof Error && cause.name === "TimeoutError") {
    return new AiProviderError("timeout", `The request to ${provider} timed out.`, provider, error);
  }

  if (NoObjectGeneratedError.isInstance(cause)) {
    return new AiProviderError("invalid_response", `${provider} returned a response that couldn't be understood as structured data.${detail}`, provider, error);
  }

  return new AiProviderError("unknown", `The request to ${provider} failed unexpectedly.${detail}`, provider, error);
}
