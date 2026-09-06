import { createOpenAI, openai } from "@ai-sdk/openai";
import { createAnthropic, anthropic } from "@ai-sdk/anthropic";
import { createGoogle, google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { ToolSet } from "@ai-sdk/provider-utils";
import type { AiProvider } from "./model-registry";

/**
 * Builds a Vercel AI SDK language model from a decrypted, per-account API key
 * (docs/byok-ai-requirements.md §9's "Provider Factory"). Never cached across requests
 * or accounts -- each call constructs a fresh provider client scoped to the one key it
 * was given, so one account's credential can never leak into another's request.
 *
 * OpenAI's provider-executed web search tool (Story E) only exists on the Responses
 * API, not Chat Completions -- `webSearch: true` routes through `.responses()` instead
 * of `.chat()` for that reason. Anthropic and Google don't have this split.
 */
export function createLanguageModel(
  provider: AiProvider,
  apiKey: string,
  modelId: string,
  options: { webSearch?: boolean } = {},
): LanguageModel {
  switch (provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return options.webSearch ? openai.responses(modelId) : openai.chat(modelId);
    }
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogle({ apiKey })(modelId);
  }
}

/**
 * Provider-executed web search tools (Story E), keyed by the exact tool name each
 * provider's request format requires -- OpenAI and Anthropic both expect "web_search";
 * Google's own tool factory doc comment requires exactly "google_search". These are
 * stateless descriptors, not authenticated clients: unlike createLanguageModel, they
 * don't take the account's API key, since the already-keyed model passed alongside them
 * in the same generateText call is what actually authenticates the request.
 *
 * Anthropic's maxUses bounds web-search cost per call
 * (docs/ai-usage-cost-requirements.md R3); OpenAI's searchContextSize is its equivalent
 * lever. Google's tool has no such cap in this API.
 */
export function createWebSearchTools(provider: AiProvider): ToolSet {
  switch (provider) {
    case "openai":
      return { web_search: openai.tools.webSearch({ searchContextSize: "low" }) };
    case "anthropic":
      return { web_search: anthropic.tools.webSearch_20260209({ maxUses: 6 }) };
    case "google":
      return { google_search: google.tools.googleSearch({}) };
  }
}
