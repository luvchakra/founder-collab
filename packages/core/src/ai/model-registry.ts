// BYOK internal model registry (docs/byok-ai-requirements.md §4). The only place in the
// codebase that knows concrete provider model IDs -- every AI operation asks for a
// provider + quality tier and gets a model ID back, so a model upgrade is a one-line
// change here rather than a hunt through every lib/ai/*.ts file.
export type AiProvider = "openai" | "anthropic" | "google";
export type AiQualityTier = "fast" | "balanced" | "reasoning";

const MODEL_REGISTRY: Record<AiProvider, Record<AiQualityTier, string>> = {
  // Matches lib/ai/client.ts's existing AI_MODELS -- Anthropic was the sole provider
  // before BYOK, so its tiers were already chosen there.
  anthropic: {
    fast: "claude-haiku-4-5",
    balanced: "claude-sonnet-5",
    reasoning: "claude-opus-5",
  },
  // gpt-5.4 family: the newest generation with an explicit mini/base/pro spread across
  // both the Chat Completions and Responses APIs (Responses is required for provider-
  // executed web search -- see provider-factory.ts).
  openai: {
    fast: "gpt-5.4-mini",
    balanced: "gpt-5.4",
    reasoning: "gpt-5.4-pro",
  },
  // Google's "-latest" aliases track its current recommended model per tier without
  // needing a code change when Google ships a new generation. "reasoning" intentionally
  // matches "balanced" here rather than pointing at "gemini-pro-latest": Google's free
  // API tier grants zero quota to Pro models (generate_content_free_tier_requests,
  // limit: 0) while Flash models do get free quota, so a free-tier BYOK key would fail
  // every research/discovery/strategy call outright if reasoning resolved to Pro. A
  // Google account with Cloud billing enabled would have quota for Pro, but that isn't
  // knowable from the API key alone, so this defaults to what actually works.
  google: {
    fast: "gemini-flash-lite-latest",
    balanced: "gemini-flash-latest",
    reasoning: "gemini-flash-latest",
  },
};

export function resolveModelId(provider: AiProvider, tier: AiQualityTier): string {
  return MODEL_REGISTRY[provider][tier];
}
