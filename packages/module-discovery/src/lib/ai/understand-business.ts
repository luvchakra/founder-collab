import { generateObject } from "ai";
import { recordAiRun as recordCoreAiRun } from "@cofounderai/core/ai-usage/mutations";
import { createUrlContextTools } from "@cofounderai/core/ai/provider-factory";
import {
  researchBusinessWebsitePrompt,
  RESEARCH_BUSINESS_WEBSITE_PROMPT_VERSION,
} from "../../prompts/business/research_business_website_v1";
import { understandBusinessPrompt } from "../../prompts/business/understand_business_v1";
import { hashInput } from "./hash";
import { BusinessProfileSchema, type BusinessProfile } from "./schemas";
import { resolveAiModelForAccount, toAiProviderError } from "./router";
import { researchWebsite } from "./research-website";

const OPERATION = "understand_business";

/**
 * Researches a business's own website and structures a {name, description} out of it --
 * the "create a business from its website" flow's own AI step (create-business-modal.tsx
 * / createBusinessFromWebsiteAction). Unlike understandProduct(), this runs against a
 * `businessId` with no `workspaceId` at all: a business has no workspace of its own (a
 * *product* under it does, per the platform's Account -> Business -> Product -> Workspace
 * hierarchy), so this can't use discovery's own workspace-keyed `ai_runs`/usage-limit
 * machinery the way every other lib/ai/*.ts operation does. Usage instead logs through
 * `core.ai_runs` (business_id-keyed, exactly the grain this operation actually has) --
 * the same shared ledger every other module already logs its own AI calls through. No
 * usage-limit check here: that ledger has no per-business cap of its own yet, and this is
 * a single one-off bootstrap call (one research fetch + one fast-tier structuring call),
 * the same order of magnitude as any other single lib/ai/*.ts operation.
 */
export async function understandBusiness(
  businessId: string,
  accountId: string,
  website: string,
): Promise<BusinessProfile> {
  const { provider, modelId, model, modelAtTier } = await resolveAiModelForAccount(accountId, OPERATION);

  const researchPrompt = researchBusinessWebsitePrompt({ website });
  const inputHash = hashInput({
    researchPrompt,
    version: RESEARCH_BUSINESS_WEBSITE_PROMPT_VERSION,
    model: modelId,
  });

  const startedAt = Date.now();
  try {
    const research = await researchWebsite(model, createUrlContextTools(provider), researchPrompt, website, provider);

    const structurePrompt = understandBusinessPrompt({ website, findings: research.findings });
    const structureResponse = await generateObject({
      model: modelAtTier("fast"),
      schema: BusinessProfileSchema,
      prompt: structurePrompt,
    });

    await recordCoreAiRun({
      businessId,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESEARCH_BUSINESS_WEBSITE_PROMPT_VERSION,
      inputHash,
      inputTokens: research.inputTokens + (structureResponse.usage.inputTokens ?? 0),
      outputTokens: research.outputTokens + (structureResponse.usage.outputTokens ?? 0),
      searchCount: research.searchCount,
      status: "succeeded",
      provider,
      durationMs: Date.now() - startedAt,
    });

    return structureResponse.object;
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordCoreAiRun({
      businessId,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESEARCH_BUSINESS_WEBSITE_PROMPT_VERSION,
      inputHash,
      status: "failed",
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
