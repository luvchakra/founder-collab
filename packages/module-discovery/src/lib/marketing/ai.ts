import { z } from "zod";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient } from "../../db/server";
import { describeContext, getDiscoveryContext } from "../intelligence/context";
import { businessAiInputHash, runBusinessAi } from "../shared/business-ai";
import { STRATEGY_DRAFT_PROMPT_VERSION, strategyDraftPrompt } from "../../prompts/marketing/strategy_draft_v1";
import { CONTENT_ASSIST_PROMPT_VERSION, contentAssistPrompt, type ContentAssistMode } from "../../prompts/marketing/content_assist_v1";
import { createContent, MarketingError, saveStrategyDraft, updateContent } from "./mutations";
import { getContent, listStrategies, pickCurrentStrategy } from "./queries";
import { CONTENT_TYPE_LABEL, MARKETING_CHANNELS, type ContentType, type MarketingStrategy } from "./types";

/**
 * MKT-04 / MKT-09 — Marketing's AI drafting. Every function here drafts and stops (CLAUDE.md
 * AI rule 3): a strategy is saved as a draft version that someone must activate; content
 * becomes a new draft version (or a new draft item, for repurposing) that still needs
 * review and approval before it can be scheduled or published. Repeating an identical
 * request returns the draft already made instead of paying for a second call.
 */

async function authorise(businessId: string): Promise<void> {
  await requireModule(businessId, "discovery");
  await requirePermission(businessId, "marketing.manage");
}

const text = (max: number) => z.string().max(max).nullable();
const list = (max: number, len = 300) => z.array(z.string().min(1).max(len)).max(max);

export const StrategyDraftSchema = z.object({
  name: z.string().min(1).max(200),
  category: text(300),
  targetProblem: text(2000),
  positioningStatement: text(2000),
  marketContext: text(4000),
  headline: text(500),
  supportingPoints: list(8),
  proofPoints: list(8),
  differentiators: list(8),
  competitorStatements: list(6),
  whyUs: text(2000),
  regions: list(10, 100),
  industries: list(10, 100),
  companySegments: list(10, 200),
  buyerSegments: list(10, 200),
  keyMessages: list(8),
  channels: z.array(z.enum(MARKETING_CHANNELS)).max(6),
  assumptions: list(10, 500),
});

function strategyText(s: MarketingStrategy | null): string | null {
  if (!s) return null;
  return JSON.stringify({
    positioning: s.positioning,
    valueProposition: s.valueProposition,
    differentiation: s.differentiation,
    targetMarkets: s.targetMarkets,
    messaging: s.messaging,
    channels: s.channels,
  });
}

/** Drafts a strategy from Discovery's own data and saves it as a new draft version. */
export async function draftStrategyWithAi(businessId: string, offeringId: string | null): Promise<{ id: string; cached: boolean }> {
  await authorise(businessId);
  const [context, strategies] = await Promise.all([getDiscoveryContext(businessId, { offeringId }), listStrategies(businessId)]);
  if (context.offerings.length === 0 && !context.business.description) {
    throw new MarketingError("STRATEGY_NOT_FOUND", "Add the business description or an offering first — there is nothing to draft from yet.");
  }
  const current = pickCurrentStrategy(strategies);
  const prompt = strategyDraftPrompt({ context: describeContext(context), existingStrategy: strategyText(current), channels: MARKETING_CHANNELS });
  const inputHash = businessAiInputHash(prompt, STRATEGY_DRAFT_PROMPT_VERSION);

  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("marketing_strategies")
    .select("id")
    .eq("business_id", businessId)
    .eq("origin", "ai_draft")
    .contains("source_refs", { inputHash })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return { id: existing.id as string, cached: true };

  const { object, model } = await runBusinessAi({
    businessId,
    operation: "marketing_strategy_draft",
    promptVersion: STRATEGY_DRAFT_PROMPT_VERSION,
    prompt,
    schema: StrategyDraftSchema,
  });
  const id = await saveStrategyDraft(
    businessId,
    {
      name: object.name,
      offeringId,
      category: object.category,
      targetProblem: object.targetProblem,
      positioningStatement: object.positioningStatement,
      marketContext: [object.marketContext, object.assumptions.length ? `Assumptions to check: ${object.assumptions.join("; ")}` : null]
        .filter(Boolean)
        .join("\n\n") || null,
      headline: object.headline,
      supportingPoints: object.supportingPoints,
      proofPoints: object.proofPoints,
      differentiators: object.differentiators,
      competitorStatements: object.competitorStatements,
      whyUs: object.whyUs,
      regions: object.regions,
      industries: object.industries,
      companySegments: object.companySegments,
      buyerSegments: object.buyerSegments,
      keyMessages: object.keyMessages,
      channels: object.channels,
    },
    current?.id ?? null,
    "ai_draft",
    { inputHash, promptVersion: STRATEGY_DRAFT_PROMPT_VERSION, model, evidence: context.evidence },
  );
  await writeAuditLog({ businessId, action: "marketing.strategy.ai_drafted", entityType: "marketing_strategy", entityId: id, after: { model } });
  return { id, cached: false };
}

export const ContentAssistSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().max(100_000),
  summary: text(2000),
  cta: text(300),
  seoTitle: text(300),
  seoDescription: text(500),
  headings: list(15),
  faq: z.array(z.object({ question: z.string().min(1).max(300), answer: z.string().max(1000) })).max(10),
});

const REPURPOSE_TYPES: ContentType[] = ["social", "email", "blog", "webinar", "ad_copy", "landing_page"];

/**
 * Generate / rewrite / SEO → a new draft version of this content. Repurpose → a new draft
 * content item of the target type, linked to the same campaign and offering. Published
 * content is never rewritten in place (updateContent refuses it); repurpose it instead.
 */
export async function assistContent(
  businessId: string,
  contentId: string,
  mode: ContentAssistMode,
): Promise<{ contentId: string; cached: boolean; notes: string | null }> {
  await authorise(businessId);
  const content = await getContent(businessId, contentId);
  if (!content) throw new MarketingError("CONTENT_NOT_FOUND", "That content no longer exists.");
  if (mode.mode === "repurpose" && !REPURPOSE_TYPES.includes(mode.targetType as ContentType)) {
    throw new MarketingError("CONTENT_INVALID_STATE", "Choose a format to repurpose into.");
  }
  if (mode.mode !== "repurpose" && content.status === "published") {
    throw new MarketingError("CONTENT_INVALID_STATE", "Published content is kept as it went out. Repurpose or duplicate it instead.");
  }
  if ((mode.mode === "rewrite" || mode.mode === "repurpose" || mode.mode === "seo") && !content.body?.trim()) {
    throw new MarketingError("CONTENT_INVALID_STATE", "Write or generate a draft first.");
  }
  if (mode.mode === "generate" && !content.brief?.trim() && !content.title.trim()) {
    throw new MarketingError("CONTENT_INVALID_STATE", "Add a brief first.");
  }

  const context = await getDiscoveryContext(businessId, { offeringId: content.offeringId });
  const targetType = mode.mode === "repurpose" ? (mode.targetType as ContentType) : content.contentType;
  const prompt = contentAssistPrompt({
    mode: mode.mode === "repurpose" ? { mode: "repurpose", targetType: CONTENT_TYPE_LABEL[targetType] } : mode,
    contentType: CONTENT_TYPE_LABEL[content.contentType],
    title: content.title,
    brief: content.brief,
    body: content.body,
    audience: content.audience,
    cta: content.cta,
    context: describeContext(context),
  });
  const inputHash = businessAiInputHash(prompt, CONTENT_ASSIST_PROMPT_VERSION);

  // Cache: the same request against the same draft has already produced a version.
  const supabase = await createClient();
  const { data: cached, error: cacheError } = await supabase
    .from("marketing_content_versions")
    .select("content_id")
    .eq("business_id", businessId)
    .contains("source_refs", { inputHash })
    .limit(1)
    .maybeSingle();
  if (cacheError) throw cacheError;
  if (cached) return { contentId: cached.content_id as string, cached: true, notes: null };

  const { object, model } = await runBusinessAi({
    businessId,
    operation: "marketing_content_assist",
    promptVersion: CONTENT_ASSIST_PROMPT_VERSION,
    prompt,
    schema: ContentAssistSchema,
  });
  const sourceRefs = { inputHash, promptVersion: CONTENT_ASSIST_PROMPT_VERSION, model, mode: mode.mode, evidence: context.evidence };
  const notes =
    object.headings.length || object.faq.length
      ? [object.headings.length ? `Headings: ${object.headings.join(" · ")}` : null, object.faq.length ? `FAQ: ${object.faq.map((f) => f.question).join(" · ")}` : null]
          .filter(Boolean)
          .join("\n")
      : null;

  const base = {
    offeringId: content.offeringId,
    campaignId: content.campaignId,
    brief: content.brief,
    audience: content.audience,
    channel: content.channel,
  };

  if (mode.mode === "repurpose") {
    const newId = await createContent(
      businessId,
      {
        ...base,
        title: object.title,
        contentType: targetType,
        body: object.body,
        summary: object.summary,
        cta: object.cta ?? content.cta,
        seoTitle: object.seoTitle,
        seoDescription: object.seoDescription,
      },
      "ai_repurposed",
      { ...sourceRefs, repurposedFrom: content.id },
    );
    return { contentId: newId, cached: false, notes };
  }

  const keepBody = mode.mode === "seo";
  await updateContent(
    businessId,
    content.id,
    {
      ...base,
      title: keepBody ? content.title : object.title,
      contentType: content.contentType,
      body: keepBody ? content.body : object.body,
      summary: keepBody ? content.summary : (object.summary ?? content.summary),
      cta: keepBody ? content.cta : (object.cta ?? content.cta),
      seoTitle: object.seoTitle ?? content.seoMetadata.title ?? null,
      seoDescription: object.seoDescription ?? content.seoMetadata.description ?? null,
    },
    {
      origin: mode.mode === "generate" ? "ai_generated" : "ai_rewritten",
      sourceRefs,
      metadata: { headings: object.headings, faq: object.faq },
    },
  );
  return { contentId: content.id, cached: false, notes };
}

