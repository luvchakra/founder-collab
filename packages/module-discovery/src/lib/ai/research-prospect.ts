import { generateObject, generateText } from "ai";
import { createClient } from "../../db/server";
import { getProspect } from "../prospects/queries";
import { getWorkspace, getProduct } from "../tenancy/queries";
import { getIcpProfile } from "../icp/queries";
import { getProspectResearch } from "../research/queries";
import type { ProspectResearch } from "../research/types";
import {
  researchProspectPrompt,
  structureResearchPrompt,
  RESEARCH_PROSPECT_PROMPT_VERSION,
} from "../../prompts/research/research_prospect_v2";
import { hashInput } from "./hash";
import { ProspectResearchSchema } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { hasRecentSuccess } from "./dedup";
import { resolveAiModel, toAiProviderError } from "./router";
import { createWebSearchTools } from "@cofounderai/core/ai/provider-factory";

const OPERATION = "research_prospect";
const RESEARCH_TTL_DAYS = 30;

/**
 * Researches a prospect via two calls through the BYOK router (lib/ai/router.ts):
 * 1. The operation's "reasoning" tier model plus that provider's own provider-executed
 *    web search tool (lib/ai/provider-factory.ts's createWebSearchTools) gathers sourced
 *    findings -- whichever of the three providers the account connected.
 * 2. The same provider's "fast" tier (via resolveAiModel's modelAtTier, no second
 *    credential fetch) structures those findings into ProspectResearchSchema -- pure
 *    extraction from already-written text, exactly the "cheap model" case blueprint §11
 *    calls out.
 *
 * The model is instructed not to invent facts; each evidence item carries a
 * fact/inference/assumption/unknown `evidence_type` tag (blueprint §33) plus its own
 * separate `confidence`, source description/URL, observed date, and which signal (if
 * any) it supports (DISC-OFFER-P0-06.1) rather than being asserted flatly.
 */
export async function researchProspect(prospectId: string): Promise<ProspectResearch> {
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new Error("Prospect not found.");

  const workspace = await getWorkspace(prospect.workspace_id);
  if (!workspace) throw new Error("Workspace not found.");

  const product = await getProduct(workspace.product_id);
  if (!product) throw new Error("Product not found.");

  await assertWithinUsageLimit(workspace.id);

  const icp = await getIcpProfile(workspace.id);

  const researchPrompt = researchProspectPrompt({
    prospect,
    productName: product.name,
    productProfile: product.product_profile,
    icp,
  });

  const { accountId, provider, modelId, model, modelAtTier } = await resolveAiModel(
    workspace.id,
    OPERATION,
  );
  const inputHash = hashInput({
    researchPrompt,
    version: RESEARCH_PROSPECT_PROMPT_VERSION,
    model: modelId,
  });

  // A double-click or resubmitted "Research" click with nothing changed would otherwise
  // re-run the most expensive operation in the app (web search) twice for the same input.
  if (await hasRecentSuccess(workspace.id, OPERATION, inputHash, undefined, modelId)) {
    const current = await getProspectResearch(prospectId);
    if (current) return current;
  }

  const startedAt = Date.now();
  try {
    const searchResponse = await generateText({
      model,
      tools: createWebSearchTools(provider),
      prompt: researchPrompt,
    });

    const findings = searchResponse.text.trim();
    if (!findings) throw new Error("Web research returned no findings.");

    const structureResponse = await generateObject({
      model: modelAtTier("fast"),
      schema: ProspectResearchSchema,
      prompt: structureResearchPrompt(findings),
    });
    const draft = structureResponse.object;

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESEARCH_PROSPECT_PROMPT_VERSION,
      inputHash,
      inputTokens:
        (searchResponse.usage.inputTokens ?? 0) + (structureResponse.usage.inputTokens ?? 0),
      outputTokens:
        (searchResponse.usage.outputTokens ?? 0) + (structureResponse.usage.outputTokens ?? 0),
      searchCount: searchResponse.toolCalls.length,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("prospect_research")
      .upsert(
        {
          workspace_id: workspace.id,
          prospect_id: prospect.id,
          summary: draft.summary,
          pain_points: draft.pain_points,
          buying_signals: draft.buying_signals,
          recent_events: draft.recent_events,
          recommended_angle: draft.recommended_angle,
          evidence: draft.evidence,
          researched_at: new Date().toISOString(),
          expires_at: new Date(
            Date.now() + RESEARCH_TTL_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
        { onConflict: "prospect_id" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESEARCH_PROSPECT_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
