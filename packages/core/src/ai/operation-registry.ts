import type { AiQualityTier } from "./model-registry";

// BYOK AI operation registry (docs/byok-ai-requirements.md §5). Every AI-invoking
// function in lib/ai/ declares its requirements here instead of picking a model tier
// itself -- the router (router.ts) is what turns "operation" into "provider + model".
export type AiOperation =
  | "understand_business"
  | "understand_product"
  | "discover_products"
  | "generate_icp"
  | "research_prospect"
  | "discover_prospects"
  | "generate_outreach_strategy"
  | "generate_outreach_message"
  | "generate_reply"
  | "classify_reply"
  | "chat"
  | "restructure_import"
  | "draft_review_response";

export type AiOperationSpec = {
  qualityTier: AiQualityTier;
  /** Needs a provider-executed web search tool wired into the request (Story E). */
  requiresWebSearch: boolean;
};

const OPERATION_REGISTRY: Record<AiOperation, AiOperationSpec> = {
  // Same shape as understand_product below, just for a business instead of a single
  // product -- researches the business's own website via the provider-executed search
  // tool, then structures a short name/description from those findings.
  understand_business: { qualityTier: "reasoning", requiresWebSearch: true },
  // Reasoning + web search: understandProduct() researches the product's own website
  // via the provider-executed search tool before structuring a profile, same shape as
  // research_prospect below -- not just "balanced" text extraction from static sources
  // anymore.
  understand_product: { qualityTier: "reasoning", requiresWebSearch: true },
  // Same shape as understand_product: researches a live website via the provider-
  // executed search tool before structuring a list, rather than extracting from a
  // static source already in hand.
  discover_products: { qualityTier: "reasoning", requiresWebSearch: true },
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
  // Fast, not balanced: mapping an uploaded file's own columns/text onto the prospect
  // schema is extraction, not synthesis -- same tier classify_reply already uses for a
  // comparably mechanical task.
  restructure_import: { qualityTier: "fast", requiresWebSearch: false },
  // Balanced, same tier as generate_outreach_message: drafting a short, on-brand reply
  // to one review's rating/comment is a bounded writing task, not extraction (fast) or
  // multi-source synthesis (reasoning). CRM-08.6's own first caller of this registry
  // from outside module-discovery -- see business-router.ts for the business_id-scoped
  // (rather than workspace_id-scoped) credential resolution any other non-discovery
  // module can now reuse the same way.
  draft_review_response: { qualityTier: "balanced", requiresWebSearch: false },
};

export function getOperationSpec(operation: AiOperation): AiOperationSpec {
  return OPERATION_REGISTRY[operation];
}
