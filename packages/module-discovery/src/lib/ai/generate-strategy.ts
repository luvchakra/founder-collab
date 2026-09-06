import { generateObject } from "ai";
import { createClient } from "../../db/server";
import { getProspect } from "../prospects/queries";
import { getWorkspace, getProduct } from "../tenancy/queries";
import { getIcpProfile } from "../icp/queries";
import { getProspectResearch } from "../research/queries";
import { getProspectScore } from "../scoring/queries";
import type { Contact } from "../contacts/types";
import type { OutreachStrategy } from "../outreach/types";
import {
  generateStrategyPrompt,
  GENERATE_STRATEGY_PROMPT_VERSION,
} from "../../prompts/outreach/generate_strategy_v1";
import { hashInput } from "./hash";
import { OutreachStrategySchema } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { resolveAiModel, toAiProviderError } from "./router";

const OPERATION = "generate_outreach_strategy";

/**
 * Requires the pipeline blueprint §18 assumes: approved product profile -> approved ICP
 * -> prospect research. Routed through the AI router at the "reasoning" quality tier
 * (lib/ai/operation-registry.ts) because strategy synthesis -- tying research evidence
 * to a specific angle and CTA -- is exactly the case blueprint §11 calls out for the
 * strongest model, unlike extraction/classification.
 */
export async function generateOutreachStrategy(
  prospectId: string,
  contactId: string | null,
): Promise<OutreachStrategy> {
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new Error("Prospect not found.");

  const workspace = await getWorkspace(prospect.workspace_id);
  if (!workspace) throw new Error("Workspace not found.");

  const product = await getProduct(workspace.product_id);
  if (!product) throw new Error("Product not found.");
  if (!product.product_profile) {
    throw new Error("Generate a product profile before creating an outreach strategy.");
  }

  const icp = await getIcpProfile(workspace.id);
  if (!icp || icp.status !== "approved") {
    throw new Error("Approve an ICP before creating an outreach strategy.");
  }

  const research = await getProspectResearch(prospectId);
  if (!research) {
    throw new Error("Research this prospect before creating an outreach strategy.");
  }

  const score = await getProspectScore(prospectId);

  await assertWithinUsageLimit(workspace.id);

  const supabase = await createClient();
  let contact: Contact | null = null;
  if (contactId) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .maybeSingle();
    contact = data;
  }

  const prompt = generateStrategyPrompt({
    productName: product.name,
    productProfile: product.product_profile,
    icp,
    prospect,
    research,
    score,
    contact,
  });

  const { accountId, provider, modelId, model } = await resolveAiModel(workspace.id, OPERATION);
  const inputHash = hashInput({
    prompt,
    version: GENERATE_STRATEGY_PROMPT_VERSION,
    model: modelId,
  });

  const startedAt = Date.now();
  try {
    const response = await generateObject({
      model,
      schema: OutreachStrategySchema,
      prompt,
    });
    const draft = response.object;

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: GENERATE_STRATEGY_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    const { data, error } = await supabase
      .from("outreach_strategies")
      .insert({
        workspace_id: workspace.id,
        prospect_id: prospect.id,
        contact_id: contactId,
        strategy: draft.strategy,
        channel: draft.channel,
        reason: draft.reason,
        key_message: draft.key_message,
        cta: draft.cta,
        status: "draft",
      })
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
      promptVersion: GENERATE_STRATEGY_PROMPT_VERSION,
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
