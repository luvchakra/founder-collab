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
  | "draft_review_response"
  | "check_response_quality"
  | "summarize_customer"
  | "summarize_conversation"
  | "suggest_offering_profile"
  | "generate_research_brief";

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
  // Balanced, not fast: CRM-09.7's pre-send quality check is a judgment call across five
  // separate semantic dimensions (unanswered question, unsupported claim, missing price/
  // availability fact, risky/uncertain statement, wrong customer/context) on a message
  // that's about to go out to a real customer -- worth more than the "fast" tier
  // classify_reply uses for a much narrower single-label task. The sixth check (overly
  // long) is deterministic (a plain length threshold), never routed through here.
  check_response_quality: { qualityTier: "balanced", requiresWebSearch: false },
  // Balanced, same tier as draft_review_response: composing a short summary from
  // already-structured CRM facts (Customer 360's own data) is a bounded writing task,
  // not the multi-source strategic synthesis chat/generate_outreach_strategy use
  // "reasoning" for.
  summarize_customer: { qualityTier: "balanced", requiresWebSearch: false },
  // Balanced, same tier as summarize_customer: extracting unresolved questions/promised
  // actions/sentiment from one conversation's own message history is bounded analysis
  // over given text, not multi-source synthesis.
  summarize_conversation: { qualityTier: "balanced", requiresWebSearch: false },
  // DISC-OFFER-P0-02.1's "Offering Setup Wizard" -- fast, same tier as classify_reply/
  // restructure_import: restating a founder's own free-text description into a handful
  // of flat fields is extraction, not synthesis, and needs no web search (unlike
  // understand_product, this never researches a website).
  suggest_offering_profile: { qualityTier: "fast", requiresWebSearch: false },
  // DISC-OFFER-P0-06.2's "Offering Research Brief" -- reasoning, same tier and shape as
  // generate_outreach_strategy: synthesizing offering_fit/problem_hypothesis/
  // potential_objection/suggested_opening from already-gathered research, ICP and
  // negative-signal evidence is exactly that tier's "tying research evidence to a
  // specific angle" case, not extraction. No web search: this reuses researchProspect()'s
  // own already-fetched findings rather than searching again (minimize LLM calls).
  generate_research_brief: { qualityTier: "reasoning", requiresWebSearch: false },
};

export function getOperationSpec(operation: AiOperation): AiOperationSpec {
  return OPERATION_REGISTRY[operation];
}
