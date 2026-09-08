import type { AiProvider } from "../ai/model-registry";

export type { AiProvider };
export type AiRunStatus = "succeeded" | "failed";

export interface AiRun {
  id: string;
  business_id: string;
  operation: string;
  model: string;
  provider: string | null;
  prompt_version: string;
  input_hash: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  duration_ms: number | null;
  search_count: number | null;
  status: AiRunStatus;
  error_code: string | null;
  created_at: string;
}

/** UI-facing view of `ai_provider_credentials` -- never the encrypted key itself,
 * mirrors `module-discovery/lib/ai-providers/types.ts`'s own connection-status shape. */
export interface AiProviderConnection {
  provider: AiProvider;
  keyFingerprint: string;
  status: "connected" | "error";
  lastValidatedAt: string | null;
  lastError: string | null;
}

export interface BusinessAiUsage {
  businessId: string;
  periodStart: string;
  periodEnd: string;
  byOperation: { operation: string; runs: number; cost: number }[];
  totalCost: number;
}
