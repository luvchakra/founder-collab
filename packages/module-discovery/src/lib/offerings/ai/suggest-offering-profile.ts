import { generateObject } from "ai";
import { getWorkspaceForProduct } from "../../tenancy/queries";
import { suggestOfferingProfilePrompt, SUGGEST_OFFERING_PROFILE_PROMPT_VERSION } from "../../../prompts/offerings/suggest_offering_profile_v1";
import { hashInput } from "../../ai/hash";
import { OfferingProfileSuggestionSchema, type OfferingProfileSuggestion } from "../../ai/schemas";
import { recordAiRun } from "../../ai/usage";
import { assertWithinUsageLimit } from "../../usage/limits";
import { resolveAiModel, toAiProviderError } from "../../ai/router";
import { OFFERING_TYPE_VALUES } from "../types";

const OPERATION = "suggest_offering_profile";

/**
 * DISC-OFFER-P0-02.1's "Offering Setup Wizard" AI half -- structures a founder's own
 * free-text description straight into the flat Offering fields, no website research
 * (unlike `understandProduct()`, which requires a website and crawls it). Deliberately
 * NEVER writes to `discovery.products` itself: the caller (the offering edit dialog)
 * shows the result as an editable proposal the founder must accept/edit before saving --
 * "AI does not silently save inferred information as fact" is enforced structurally
 * here, not by convention, by this function having no write path at all.
 *
 * Requires an already-existing offering (and therefore workspace) purely for AI-usage
 * accounting (`ai_runs.workspace_id`/`assertWithinUsageLimit` are both workspace-scoped)
 * -- a brand new, not-yet-created offering has no workspace to charge this to yet, so
 * "Suggest fields" only becomes available once the offering exists (name alone is
 * enough to create one) and is being edited, not during the initial create dialog.
 */
export async function suggestOfferingProfile(offeringId: string, description: string): Promise<OfferingProfileSuggestion> {
  const trimmed = description.trim();
  if (!trimmed) throw new Error("Describe the offering first.");

  const workspace = await getWorkspaceForProduct(offeringId);
  if (!workspace) throw new Error("Workspace not found for this offering.");

  await assertWithinUsageLimit(workspace.id);

  const { accountId, provider, modelId, model, modelAtTier } = await resolveAiModel(workspace.id, OPERATION);

  const prompt = suggestOfferingProfilePrompt({ offeringTypeValues: OFFERING_TYPE_VALUES, description: trimmed });
  const inputHash = hashInput({ prompt, version: SUGGEST_OFFERING_PROFILE_PROMPT_VERSION, model: modelId });

  const startedAt = Date.now();
  try {
    const response = await generateObject({
      model: modelAtTier("fast"),
      schema: OfferingProfileSuggestionSchema,
      prompt,
    });

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: SUGGEST_OFFERING_PROFILE_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens ?? 0,
      outputTokens: response.usage.outputTokens ?? 0,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    return response.object;
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: SUGGEST_OFFERING_PROFILE_PROMPT_VERSION,
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
