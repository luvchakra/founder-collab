import { streamObject } from "ai";
import { recordAiRun as recordCoreAiRun } from "@cofounderai/core/ai-usage/mutations";
import { createUrlContextTools } from "@cofounderai/core/ai/provider-factory";
import {
  researchBusinessWebsitePrompt,
  RESEARCH_BUSINESS_WEBSITE_PROMPT_VERSION,
} from "../../prompts/business/research_business_website_v1";
import { understandBusinessWebsitePrompt } from "../../prompts/business/understand_business_website_v1";
import { hashInput } from "./hash";
import { WebsiteBusinessProfileSchema, type WebsiteBusinessProfile } from "./schemas";
import { resolveAiModelForAccount, toAiProviderError } from "./router";
import { researchWebsite } from "./research-website";
import { sanitizeWebsiteProfile } from "../website-onboarding/sanitize";

const OPERATION = "understand_business_website";

/**
 * DISC-OFFER-P0-09.1's own AI step: researches the business's own website (reusing
 * researchWebsite() -- a single page, this story's own website URL, exactly as
 * understandBusiness() already does; DISC-OFFER-P0-09.2 is what adds a real multi-page
 * crawl on top of this same fetch mechanism) and structures the full
 * WebsiteBusinessProfileSchema out of it, then runs it through sanitizeWebsiteProfile()
 * so "unknown never carries a value" holds regardless of what the model returned.
 *
 * Same business_id-scoped ai_runs logging as understandBusiness() (see that file's own
 * doc comment for why: this runs before any workspace exists to key discovery's own
 * workspace-scoped ai_runs/usage-limit machinery off).
 *
 * Deliberately takes no `force`/freshness-caching parameter the way understandProduct()
 * does: a website onboarding run is a one-shot, explicitly founder-triggered action (the
 * "Understand My Business" button, or an explicit "Retry"), not something re-derived
 * silently on every page load, so there is no stale/fresh distinction to make here.
 */
export async function understandBusinessWebsite(
  businessId: string,
  accountId: string,
  website: string,
  /** The AI SDK's own streamed partial object, forwarded as-is so a caller (the
   * streaming route handler behind the business page's onboarding panel) can show live
   * progress ("Found business_name... description...") the same way
   * discoverProductsFromWebsite()'s own onProgress already does. Loosely typed on
   * purpose -- a still-streaming partial has no useful field-level type safety to offer,
   * and the only consumer re-serializes it straight to JSON for the client anyway. */
  onProgress?: (partial: Record<string, unknown>) => void,
): Promise<WebsiteBusinessProfile> {
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

    const structureResponse = streamObject({
      model: modelAtTier("fast"),
      schema: WebsiteBusinessProfileSchema,
      prompt: understandBusinessWebsitePrompt({ website, findings: research.findings }),
    });

    if (onProgress) {
      for await (const partial of structureResponse.partialObjectStream) {
        onProgress(partial as Record<string, unknown>);
      }
    }

    const structureObject = await structureResponse.object;
    const structureUsage = await structureResponse.usage;
    const profile = sanitizeWebsiteProfile(structureObject);

    await recordCoreAiRun({
      businessId,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESEARCH_BUSINESS_WEBSITE_PROMPT_VERSION,
      inputHash,
      inputTokens: research.inputTokens + (structureUsage.inputTokens ?? 0),
      outputTokens: research.outputTokens + (structureUsage.outputTokens ?? 0),
      searchCount: research.searchCount,
      status: "succeeded",
      provider,
      durationMs: Date.now() - startedAt,
    });

    return profile;
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
