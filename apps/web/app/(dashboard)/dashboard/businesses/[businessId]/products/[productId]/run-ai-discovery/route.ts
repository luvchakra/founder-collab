import { NextResponse } from "next/server";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  markPipelineStageRunning,
  markPipelineStageCompleted,
  markPipelineStageFailed,
  markPipelineStageSkipped,
} from "@cofounderai/module-discovery/lib/pipeline/mutations";
import { listPipelineStages } from "@cofounderai/module-discovery/lib/pipeline/queries";
import { PIPELINE_STAGE_KEYS, type PipelineStageKey } from "@cofounderai/module-discovery/lib/pipeline/types";
import {
  runWebsiteUnderstandingStage,
  runOfferingProfileStage,
  runIcpStage,
  runBuyerPersonasStage,
  runDiscoveryStrategyStage,
  runAccountDiscoveryStage,
  runSignalsStage,
  runSignalCorrelationStage,
  runOpportunityScoringStage,
  runWhyNowStage,
  runResearchStage,
  runBuyerIntelligenceStage,
  runRecommendedActionStage,
  requireActiveDefinition,
  activeOpportunities,
  type StageContext,
  type StageOutcome,
} from "@cofounderai/module-discovery/lib/pipeline/handlers";
import { computeHandoffStatus } from "@cofounderai/module-discovery/lib/opportunities/handoff";
import { getDiscoveryHandoffLead } from "@cofounderai/module-crm/contract/index";

/**
 * DISC-OFFER-P0-10.1: "Run AI Discovery CTA" -- runs exactly one pipeline stage per
 * request, rather than all fourteen in one long-lived streamed call (the shape
 * `website-onboarding/route.ts`, DISC-OFFER-P0-09.x, uses for its own two-step AI call).
 * Deliberately different here: several of this pipeline's stages call *existing*
 * functions (`understandProduct`, `generateIcp`, `discoverProspects`, `researchProspect`,
 * `generateResearchBrief`) that each independently read the offering/ICP/prospect state
 * through this app's own request-scoped Supabase client and React `cache()`-wrapped
 * queries -- correct when each is invoked from its own separate request (a single button
 * click today), but an open correctness risk if several ran back-to-back inside one
 * shared request/cache scope, where an early stage's write (e.g. a fresh
 * `product_profile`) could be invisible to a later stage's own cached read of the same
 * row within that same request. Running one stage per request sidesteps the question
 * entirely -- every stage gets its own fresh request and cache scope, exactly like every
 * other single-AI-action call in this module already does. The client-side panel drives
 * the loop across stages (see run-ai-discovery-panel.tsx), which is also what makes
 * "progress is visible" (each stage's own completion is a discrete, immediately-rendered
 * event) and "user can leave and return" (every transition is committed to
 * `discovery.pipeline_stages` before this response returns, not held in memory) hold for
 * real rather than by convention.
 *
 * `crm_handoff` (DISC-OFFER-P0-08.x's own module boundary) is handled here directly
 * rather than inside `@cofounderai/module-discovery`'s own pipeline handlers: every other
 * cross-module Discovery/CRM read in this codebase (the Opportunity Detail page) already
 * calls `@cofounderai/module-crm/contract` from the `apps/web` layer rather than from
 * inside module-discovery's own `lib/`, and this stage follows that same established
 * placement rather than being the first to import module-crm into module-discovery's own
 * package.
 */
export async function POST(request: Request, { params }: { params: Promise<{ businessId: string; productId: string }> }) {
  const { businessId, productId } = await params;
  const body = (await request.json().catch(() => null)) as { stageKey?: string } | null;
  const stageKey = body?.stageKey;

  if (!stageKey || !PIPELINE_STAGE_KEYS.includes(stageKey as PipelineStageKey)) {
    return NextResponse.json({ ok: false, error: "Unknown pipeline stage." }, { status: 400 });
  }

  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) {
    return NextResponse.json({ ok: false, error: "Offering not found." }, { status: 404 });
  }
  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "Offering not found." }, { status: 404 });
  }

  const key = stageKey as PipelineStageKey;
  const ctx: StageContext = { workspaceId: workspace.id, productId: product.id };

  await markPipelineStageRunning(workspace.id, key);

  try {
    const result = await runStage(key, ctx, businessId);
    const stage =
      result.outcome === "skipped"
        ? await markPipelineStageSkipped(workspace.id, key)
        : await markPipelineStageCompleted(workspace.id, key);
    return NextResponse.json({ ok: true, stage, detail: result.detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    const stage = await markPipelineStageFailed(workspace.id, key, message);
    return NextResponse.json({ ok: false, stage, error: message });
  }
}

async function runStage(key: PipelineStageKey, ctx: StageContext, businessId: string): Promise<StageOutcome> {
  switch (key) {
    case "website_understanding":
      return runWebsiteUnderstandingStage(ctx);
    case "offering_profile":
      return runOfferingProfileStage(ctx);
    case "icp":
      return runIcpStage(ctx);
    case "buyer_personas":
      return runBuyerPersonasStage(ctx);
    case "discovery_strategy":
      return runDiscoveryStrategyStage(ctx);
    case "account_discovery":
      return runAccountDiscoveryStage(ctx);
    case "signals":
      return runSignalsStage(ctx);
    case "signal_correlation":
      return runSignalCorrelationStage(ctx);
    case "opportunity_scoring":
      return runOpportunityScoringStage(ctx);
    case "why_now":
      return runWhyNowStage(ctx);
    case "research":
      return runResearchStage(ctx);
    case "buyer_intelligence":
      return runBuyerIntelligenceStage(ctx);
    case "recommended_action":
      return runRecommendedActionStage(ctx);
    case "crm_handoff":
      return runCrmHandoffStage(ctx, businessId);
  }
}

/** No mutation of its own -- handoff readiness is already a live, computed-on-read value
 * everywhere else it's shown (the Opportunity Detail page). This stage just confirms how
 * many of this offering's open opportunities are ready for a founder to review and send,
 * without sending anything itself (DISC-OFFER-P0-15.1 / §25: "must NOT send outbound
 * communication... without user approval"). */
async function runCrmHandoffStage(ctx: StageContext, businessId: string): Promise<StageOutcome> {
  const definition = await requireActiveDefinition(ctx.workspaceId);
  const opportunities = await activeOpportunities(ctx.workspaceId, definition.id);
  if (opportunities.length === 0) return { outcome: "skipped", detail: "No open opportunities to prepare for handoff." };

  let ready = 0;
  for (const opportunity of opportunities) {
    const leadResult = await getDiscoveryHandoffLead(businessId, opportunity.prospect_id);
    const status = computeHandoffStatus({
      opportunityStatus: opportunity.status,
      handoffFailedAt: opportunity.handoff_failed_at,
      hasExistingCrmLead: leadResult.ok && leadResult.data !== null,
    });
    if (status === "not_sent") ready += 1;
  }
  return { outcome: "completed", detail: `${ready} opportunity(ies) ready for CRM handoff review.` };
}

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string; productId: string }> }) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) {
    return NextResponse.json({ ok: false, error: "Offering not found." }, { status: 404 });
  }
  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "Offering not found." }, { status: 404 });
  }
  const stages = await listPipelineStages(workspace.id);
  return NextResponse.json({ ok: true, stages });
}
