import { generateObject } from "ai";
import { createClient } from "../../db/server";
import { getProspect } from "../prospects/queries";
import { getWorkspace, getProduct } from "../tenancy/queries";
import { getIcpProfile } from "../icp/queries";
import { getProspectResearch } from "../research/queries";
import { listBuyerPersonas } from "../personas/queries";
import { listOpportunitiesForProspect } from "../opportunities/queries";
import { setOpportunityWhyThem } from "../opportunities/mutations";
import { listNegativeSignalsForProspect } from "../negative-signals/queries";
import type { ResearchBrief } from "../research-briefs/types";
import { researchBriefPrompt, RESEARCH_BRIEF_PROMPT_VERSION } from "../../prompts/research/research_brief_v1";
import { hashInput } from "./hash";
import { ResearchBriefSchema } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { resolveAiModel, toAiProviderError } from "./router";

const OPERATION = "generate_research_brief";

/**
 * DISC-OFFER-P0-06.2: "Offering Research Brief". Requires research to already exist
 * (same guard `generateOutreachStrategy` uses) -- a brief with nothing to synthesize
 * from would either be empty or invented, neither acceptable. Also requires an approved
 * ICP, for the same "offering_fit needs something real to compare against" reason
 * `scoreProspect()`/`detectNegativeSignals` already enforce.
 *
 * When an opportunity already exists for this prospect, the brief's own `offering_fit`
 * is also written into that opportunity's `why_them` (`setOpportunityWhyThem`) -- the
 * same "write back into the existing opportunity slot" pattern 05.3/05.4 already
 * established for `signal_strength_score`/`timing`/`why_now`. The most recently created
 * opportunity is used when more than one exists (a prospect can have several across
 * different discovery definitions, 05.1) since a fresh brief reflects the current state
 * of research, most relevant to whichever evaluation is newest.
 */
export async function generateResearchBrief(prospectId: string): Promise<ResearchBrief> {
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new Error("Prospect not found.");

  const workspace = await getWorkspace(prospect.workspace_id);
  if (!workspace) throw new Error("Workspace not found.");

  const product = await getProduct(workspace.product_id);
  if (!product) throw new Error("Product not found.");

  const icp = await getIcpProfile(workspace.id);
  if (!icp || icp.status !== "approved") {
    throw new Error("Approve an ICP before generating a research brief.");
  }

  const research = await getProspectResearch(prospectId);
  if (!research) {
    throw new Error("Research this prospect before generating a research brief.");
  }

  await assertWithinUsageLimit(workspace.id);

  const [personas, opportunities, negativeSignals] = await Promise.all([
    listBuyerPersonas(workspace.id),
    listOpportunitiesForProspect(prospectId),
    listNegativeSignalsForProspect(prospectId),
  ]);
  const opportunity = opportunities[0] ?? null;

  const prompt = researchBriefPrompt({
    productName: product.name,
    productProfile: product.product_profile,
    icp,
    prospect,
    research,
    personas,
    opportunity,
    negativeSignals,
  });

  const { accountId, provider, modelId, model } = await resolveAiModel(workspace.id, OPERATION);
  const inputHash = hashInput({ prompt, version: RESEARCH_BRIEF_PROMPT_VERSION, model: modelId });

  const startedAt = Date.now();
  try {
    const response = await generateObject({ model, schema: ResearchBriefSchema, prompt });
    const draft = response.object;

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESEARCH_BRIEF_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("research_briefs")
      .upsert(
        {
          workspace_id: workspace.id,
          prospect_id: prospect.id,
          offering_fit: draft.offering_fit,
          problem_hypothesis: draft.problem_hypothesis,
          potential_objection: draft.potential_objection,
          suggested_opening: draft.suggested_opening,
          confidence: draft.confidence,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "prospect_id" },
      )
      .select()
      .single();
    if (error) throw error;

    if (opportunity) {
      await setOpportunityWhyThem(opportunity.id, draft.offering_fit);
    }

    return data;
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESEARCH_BRIEF_PROMPT_VERSION,
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
