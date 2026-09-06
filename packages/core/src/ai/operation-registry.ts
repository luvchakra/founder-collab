import type { AiQualityTier } from "./model-registry";

// BYOK AI operation registry (docs/byok-ai-requirements.md §5). Every AI-invoking
// function in lib/ai/ declares its requirements here instead of picking a model tier
// itself -- the router (router.ts) is what turns "operation" into "provider + model".
export type AiOperation =
  | "understand_product"
  | "generate_icp"
  | "research_prospect"
  | "discover_prospects"
  | "generate_outreach_strategy"
  | "generate_outreach_message"
  | "generate_reply"
  | "classify_reply"
  | "chat";

export type AiOperationSpec = {
  qualityTier: AiQualityTier;
  /** Needs a provider-executed web search tool wired into the request (Story E). */
  requiresWebSearch: boolean;
};

const OPERATION_REGISTRY: Record<AiOperation, AiOperationSpec> = {
  understand_product: { qualityTier: "balanced", requiresWebSearch: false },
  generate_icp: { qualityTier: "balanced", requiresWebSearch: false },
  research_prospect: { qualityTier: "reasoning", requiresWebSearch: true },
  discover_prospects: { qualityTier: "reasoning", requiresWebSearch: true },
  // Reasoning, not balanced: tying research evidence to a specific angle and CTA is
  // exactly the synthesis task the existing lib/ai/generate-strategy.ts picked the
  // strongest tier for -- BYOK preserves that choice rather than downgrading it.
  generate_outreach_strategy: { qualityTier: "reasoning", requiresWebSearch: false },
  generate_outreach_message: { qualityTier: "balanced", requiresWebSearch: false },
  generate_reply: { qualityTier: "balanced", requiresWebSearch: false },
  classify_reply: { qualityTier: "fast", requiresWebSearch: false },
  // Reasoning, the strongest tier: the founder asked for this directly after the
  // balanced tier kept mis-following its own context (e.g. linking to a business/
  // dashboard page instead of the specific product page it was given). Chat is a
  // synthesis task over real pipeline state plus a growing conversation history --
  // worth the strongest available model, same call as generate_outreach_strategy.
  chat: { qualityTier: "reasoning", requiresWebSearch: false },
};

export function getOperationSpec(operation: AiOperation): AiOperationSpec {
  return OPERATION_REGISTRY[operation];
}
