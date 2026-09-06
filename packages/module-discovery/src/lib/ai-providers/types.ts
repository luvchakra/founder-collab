import type { AiProvider } from "@cofounderai/core/ai/model-registry";

export type { AiProvider };

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
};

/** UI-facing view of ai_provider_credentials -- never the encrypted key itself, see
 * lib/ai-providers/queries.ts. */
export type AiProviderConnection = {
  provider: AiProvider;
  keyFingerprint: string;
  status: "connected" | "error";
  lastValidatedAt: string | null;
  lastError: string | null;
};
