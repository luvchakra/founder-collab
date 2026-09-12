import { generateObject } from "ai";
import { createClient } from "../../db/server";
import { getProduct, getWorkspaceForProduct } from "../tenancy/queries";
import { getIcpProfile } from "../icp/queries";
import { recordIcpProfileVersion } from "../icp/mutations";
import type { IcpProfile } from "../icp/types";
import {
  generateIcpPrompt,
  GENERATE_ICP_PROMPT_VERSION,
} from "../../prompts/icp/generate_icp_v2";
import { hashInput } from "./hash";
import { IcpProfileSchema, type IcpProfileDraft } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { hasRecentSuccess } from "./dedup";
import { resolveAiModel, toAiProviderError } from "./router";

const OPERATION = "generate_icp";

/**
 * Generates (or regenerates) an ICP draft from the product's approved profile.
 * Regenerating always overwrites the existing row and resets it to "draft" -- an
 * approved ICP is only skipped when the caller does NOT explicitly force it, so this
 * never silently clobbers founder-approved data (blueprint §13).
 */
export async function generateIcp(
  productId: string,
  options: { force?: boolean } = {},
): Promise<IcpProfile> {
  const product = await getProduct(productId);
  if (!product) throw new Error("Product not found.");
  if (!product.product_profile) {
    throw new Error("Generate a product profile before defining an ICP.");
  }

  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) throw new Error("Workspace not found for product.");

  const existing = await getIcpProfile(workspace.id);
  if (existing && existing.status === "approved" && !options.force) {
    return existing;
  }

  await assertWithinUsageLimit(workspace.id);

  const prompt = generateIcpPrompt({
    productName: product.name,
    profile: product.product_profile,
  });

  const { accountId, provider, modelId, model } = await resolveAiModel(workspace.id, OPERATION);
  const inputHash = hashInput({ prompt, version: GENERATE_ICP_PROMPT_VERSION, model: modelId });

  // Guards the force-regenerate path -- a double-click on "Regenerate" with nothing
  // changed would otherwise re-bill for identical input every time.
  if (existing && (await hasRecentSuccess(workspace.id, OPERATION, inputHash, undefined, modelId))) {
    return existing;
  }

  let draft: IcpProfileDraft;
  const startedAt = Date.now();
  try {
    const response = await generateObject({
      model,
      schema: IcpProfileSchema,
      prompt,
    });
    draft = response.object;

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: GENERATE_ICP_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: GENERATE_ICP_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }

  const supabase = await createClient();
  const { data, error: upsertError } = await supabase
    .from("icp_profiles")
    .upsert(
      {
        workspace_id: workspace.id,
        name: draft.name,
        description: draft.description,
        industries: draft.industries,
        company_sizes: draft.company_sizes,
        geographies: draft.geographies,
        roles: draft.roles,
        pain_points: draft.pain_points,
        buying_signals: draft.buying_signals,
        exclusions: draft.exclusions,
        revenue: draft.revenue,
        business_model: draft.business_model,
        technology: draft.technology,
        growth_stage: draft.growth_stage,
        existing_tools: draft.existing_tools,
        confidence: draft.confidence,
        evidence: draft.evidence,
        status: "draft",
        // DISC-OFFER-P0-14.2: "existing" (fetched above) is this workspace's ICP as it
        // stood before this AI write -- 0/undefined for a workspace with none yet.
        version: (existing?.version ?? 0) + 1,
      },
      { onConflict: "workspace_id" },
    )
    .select()
    .single();
  if (upsertError) throw upsertError;

  await recordIcpProfileVersion(data, "ai_generated");
  return data;
}
