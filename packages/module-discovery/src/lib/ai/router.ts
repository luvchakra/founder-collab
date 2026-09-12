import type { SupabaseClient } from "@supabase/supabase-js";
import { APICallError, NoObjectGeneratedError, RetryError, type LanguageModel } from "ai";
import { createClient } from "../../db/server";
import { getAccountIdForWorkspace } from "../tenancy/queries";
import { decryptApiKey } from "@cofounderai/core/crypto/api-key";
import { resolveModelId, type AiProvider, type AiQualityTier } from "@cofounderai/core/ai/model-registry";
import { getOperationSpec, type AiOperation } from "@cofounderai/core/ai/operation-registry";
import { createLanguageModel } from "@cofounderai/core/ai/provider-factory";

/**
 * The AI Router (docs/byok-ai-requirements.md §9): the one place that turns
 * "operation" + "workspace" into a concrete, provider-bound language model. Callers in
 * lib/ai/*.ts never choose a model or a provider -- see resolveAiModel below.
 */

export type AiErrorCode =
  | "no_provider_connected"
  | "invalid_key"
  | "rate_limited"
  | "model_unavailable"
  | "provider_unavailable"
  | "timeout"
  | "url_retrieval_failed"
  | "no_content_found"
  | "robots_disallowed"
  | "invalid_response"
  | "unknown";

/**
 * Every user-facing AI failure normalizes to one of these codes (GTM-031) so callers get
 * a specific, accurate message without parsing provider-specific error shapes, and
 * ai_runs.error_code stays queryable. Only `invalid_key` is actually an API key problem
 * -- the others (rate limit, retrieval, content, structured-response failures) have
 * their own distinct causes and must not be worded as key issues, since
 * `isAiProviderFailure`'s "what you can do" box on the client specifically tells the
 * founder to check/replace their key, which is only correct advice for `invalid_key` and
 * (when running on BYOK) `no_provider_connected`. `invalid_key`/`rate_limited` on the
 * platform's own included-credit fallback are the deployment's problem, not the
 * founder's -- callers should word those distinctly when `credentialSource === "platform"`.
 */
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

export type ResolvedAiModel = {
  accountId: string;
  provider: AiProvider;
  modelId: string;
  model: LanguageModel;
  /** "byok" when running on the account's own connected key, "platform" when falling
   * back to CoFounderAI's own included credit (PLATFORM_AI_API_KEY) because the account
   * hasn't connected one. Lets callers/UI tell the two apart without re-querying
   * ai_provider_credentials themselves. */
  credentialSource: "byok" | "platform";
  /**
   * Builds a model at a different quality tier using the same already-resolved
   * credential, without a second DB fetch/decrypt. For multi-step operations like
   * research_prospect and discover_prospects: the reasoning tier gathers findings via
   * web search, then the fast tier structures them -- one credential resolution serves
   * both steps.
   */
  modelAtTier: (tier: AiQualityTier, options?: { webSearch?: boolean }) => LanguageModel;
};

/** The platform's own Anthropic key (docs/DESIGN.md's included-AI-credits story) --
 * "anthropic" because that was already this app's sole provider before BYOK existed
 * (see model-registry.ts's own comment), so its tiers are already tuned. Read lazily
 * (not at module load) so a deployment with no key set never pays an env lookup cost
 * anywhere near request start. */
function getPlatformCredential(): { provider: AiProvider; apiKey: string } | null {
  const apiKey = process.env.PLATFORM_AI_API_KEY;
  if (!apiKey) return null;
  return { provider: "anthropic", apiKey };
}

type ProviderCredentialRow = {
  provider: AiProvider;
  encrypted_api_key: string;
};

/**
 * Selects only the columns the router needs to build a request, and only from here --
 * per supabase/migrations/20260905041153_ai_provider_credentials_schema.sql, no
 * UI-facing query is meant to touch encrypted_api_key.
 *
 * Defaults to the RLS-scoped server client. Pass `client` (the admin client) for
 * operations with no logged-in user, e.g. classifyReply's usage from the inbound
 * email webhook.
 */
async function getProviderCredential(
  accountId: string,
  client?: SupabaseClient,
): Promise<ProviderCredentialRow | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("ai_provider_credentials")
    .select("provider, encrypted_api_key")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Resolves the language model an already-known account's AI operation should use: that
 * account's connected BYOK provider credential first (an account's own key always wins
 * when one is connected, since that's what bills the founder's own provider account
 * rather than CoFounderAI's), falling back to the platform's own included credit
 * (PLATFORM_AI_API_KEY) if the deployment has one configured -- the "no need to bring
 * your own key" option (see ai-provider/page.tsx). Throws
 * AiProviderError("no_provider_connected") only when neither is available -- callers
 * should catch this and point the founder at AI provider settings rather than surfacing
 * a generic failure.
 *
 * Split out of resolveAiModel() below so a caller that already has the accountId in hand
 * -- e.g. researching a business from its website before that business (and so any
 * workspace) exists -- doesn't need one, rather than inventing a fake workspace lookup
 * just to get back to the same accountId it started with.
 */
export async function resolveAiModelForAccount(
  accountId: string,
  operation: AiOperation,
  client?: SupabaseClient,
): Promise<ResolvedAiModel> {
  const byokCredential = await getProviderCredential(accountId, client);
  const credential: { provider: AiProvider; apiKey: string } | null = byokCredential
    ? { provider: byokCredential.provider, apiKey: decryptApiKey(byokCredential.encrypted_api_key) }
    : getPlatformCredential();
  if (!credential) {
    throw new AiProviderError(
      "no_provider_connected",
      "Connect an AI provider before using this feature.",
    );
  }

  const spec = getOperationSpec(operation);
  const modelId = resolveModelId(credential.provider, spec.qualityTier);
  const model = createLanguageModel(credential.provider, credential.apiKey, modelId, {
    webSearch: spec.requiresWebSearch,
  });

  const provider = credential.provider;
  const apiKey = credential.apiKey;
  const modelAtTier = (tier: AiQualityTier, options?: { webSearch?: boolean }) =>
    createLanguageModel(provider, apiKey, resolveModelId(provider, tier), options);

  return {
    accountId,
    provider,
    modelId,
    model,
    credentialSource: byokCredential ? "byok" : "platform",
    modelAtTier,
  };
}

/**
 * Resolves the language model a workspace-scoped AI operation should use -- looks up the
 * workspace's own account first, then delegates to resolveAiModelForAccount() above for
 * everything else. Throws AiProviderError("no_provider_connected") when the workspace
 * itself can't be resolved to an account.
 */
export async function resolveAiModel(
  workspaceId: string,
  operation: AiOperation,
  client?: SupabaseClient,
): Promise<ResolvedAiModel> {
  const accountId = await getAccountIdForWorkspace(workspaceId, client);
  if (!accountId) {
    throw new AiProviderError("no_provider_connected", "Workspace not found.");
  }
  return resolveAiModelForAccount(accountId, operation, client);
}

/**
 * Normalizes whatever a generateObject/generateText call threw into an AiProviderError
 * (GTM-031), so every lib/ai/*.ts operation surfaces the same "Your {provider} API key
 * could not complete this request" shape and ai_runs.error_code stays one of the fixed
 * AiErrorCode values regardless of which provider's SDK produced the failure.
 *
 * Always logs the raw error server-side first (Vercel function logs, never sent to the
 * client) -- without this, a failure that doesn't match one of the classified shapes
 * below becomes undiagnosable: the client only ever sees the wrapped AiProviderError,
 * never the original. The underlying message is also appended to the user-facing text
 * where available -- provider SDKs never echo the API key itself back in an error body,
 * only what's wrong with the request.
 *
 * An AiProviderError thrown earlier (e.g. resolveAiModel's no_provider_connected) passes
 * through unchanged rather than getting re-wrapped as "unknown".
 *
 * generateText/generateObject retry transient failures internally and, once retries are
 * exhausted, throw a RetryError wrapping the real failures in `.errors` -- classifying
 * against the RetryError itself would always miss (it's never an APICallError), so the
 * last underlying attempt is unwrapped first and everything below classifies that.
 */
export function toAiProviderError(error: unknown, provider: AiProvider): AiProviderError {
  if (error instanceof AiProviderError) return error;

  console.error(`[ai/router] ${provider} request failed:`, error);

  const cause = RetryError.isInstance(error) ? (error.lastError ?? error) : error;
  const detail = cause instanceof Error && cause.message ? ` (${cause.message})` : "";

  if (APICallError.isInstance(cause)) {
    const status = cause.statusCode;
    if (status === 401 || status === 403) {
      return new AiProviderError(
        "invalid_key",
        `Your ${provider} API key could not complete this request.${detail}`,
        provider,
        error,
      );
    }
    if (status === 429) {
      return new AiProviderError(
        "rate_limited",
        `Your ${provider} account hit a rate limit or quota cap.${detail}`,
        provider,
        error,
      );
    }
    if (status === 404) {
      return new AiProviderError(
        "model_unavailable",
        `The model this feature needs isn't available on your ${provider} account.${detail}`,
        provider,
        error,
      );
    }
    if (status !== undefined && status >= 500) {
      return new AiProviderError(
        "provider_unavailable",
        `${provider} is currently unavailable. Try again shortly.${detail}`,
        provider,
        error,
      );
    }
    return new AiProviderError(
      "unknown",
      `Your request to ${provider} could not be completed.${detail}`,
      provider,
      error,
    );
  }

  if (cause instanceof Error && cause.name === "TimeoutError") {
    return new AiProviderError(
      "timeout",
      `The request to ${provider} timed out.`,
      provider,
      error,
    );
  }

  // generateObject exhausts its repair attempts and throws this when the model's output
  // doesn't parse/validate against the schema -- a real, distinct failure mode from
  // "wrong API key" (e.g. the model returned prose instead of JSON, or truncated output).
  if (NoObjectGeneratedError.isInstance(cause)) {
    return new AiProviderError(
      "invalid_response",
      `${provider} returned a response that couldn't be understood as structured data.${detail}`,
      provider,
      error,
    );
  }

  return new AiProviderError(
    "unknown",
    `The request to ${provider} failed unexpectedly.${detail}`,
    provider,
    error,
  );
}
