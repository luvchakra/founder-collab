import { streamObject } from "ai";
import { recordAiRun as recordCoreAiRun } from "@cofounderai/core/ai-usage/mutations";
import { createUrlContextTools } from "@cofounderai/core/ai/provider-factory";
import {
  understandBusinessWebsitePrompt,
  UNDERSTAND_BUSINESS_WEBSITE_PROMPT_VERSION,
} from "../../prompts/business/understand_business_website_v2";
import { hashInput } from "./hash";
import { WebsiteBusinessProfileSchema, type WebsiteBusinessProfile } from "./schemas";
import { resolveAiModelForAccount, toAiProviderError } from "./router";
import { crawlWebsite, type CrawledPage } from "./website-crawl";
import { sanitizeWebsiteProfile } from "../website-onboarding/sanitize";

const OPERATION = "understand_business_website";

export type UnderstandBusinessWebsiteResult = {
  profile: WebsiteBusinessProfile;
  /** Every page the crawl actually attempted (DISC-OFFER-P0-09.2), homepage first -- the
   * caller (the streaming route handler) persists these against the onboarding run so
   * "store source URL and retrieval timestamp" holds as a real, reloadable record, not
   * just a one-time stream event. */
  pages: CrawledPage[];
};

/**
 * DISC-OFFER-P0-09.1/09.2's own AI step: crawls the business's own website
 * (lib/ai/website-crawl.ts's crawlWebsite() -- the homepage plus a bounded, same-domain,
 * robots-respecting, priority-ordered set of internal pages, DISC-OFFER-P0-09.2's own
 * addition on top of 09.1's single-page fetch) and structures the full
 * WebsiteBusinessProfileSchema out of the combined findings, then runs it through
 * sanitizeWebsiteProfile() so "unknown never carries a value" holds regardless of what the
 * model returned.
 *
 * Same business_id-scoped ai_runs logging as understandBusiness() (see that file's own
 * doc comment for why: this runs before any workspace exists to key discovery's own
 * workspace-scoped ai_runs/usage-limit machinery off) -- one row per call, its
 * input/output token counts summing every page's own research call plus the final
 * structuring call, not one row per page.
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
  /** Called once per page as the crawl visits it (homepage first), independent of
   * `onProgress` above (which only ever reports the later structuring step) -- lets a
   * caller show "Crawling: About page..." progress for DISC-OFFER-P0-09.2's own "Crawl
   * progress is visible" acceptance criterion. */
  onPageCrawled?: (page: CrawledPage) => void,
): Promise<UnderstandBusinessWebsiteResult> {
  const { provider, modelId, model, modelAtTier } = await resolveAiModelForAccount(accountId, OPERATION);

  const startedAt = Date.now();
  try {
    const crawl = await crawlWebsite(website, model, createUrlContextTools(provider), provider, onPageCrawled);

    const inputHash = hashInput({
      findings: crawl.combinedFindings,
      version: UNDERSTAND_BUSINESS_WEBSITE_PROMPT_VERSION,
      model: modelId,
    });

    const structureResponse = streamObject({
      model: modelAtTier("fast"),
      schema: WebsiteBusinessProfileSchema,
      prompt: understandBusinessWebsitePrompt({ website, findings: crawl.combinedFindings }),
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
      promptVersion: UNDERSTAND_BUSINESS_WEBSITE_PROMPT_VERSION,
      inputHash,
      inputTokens: crawl.usage.inputTokens + (structureUsage.inputTokens ?? 0),
      outputTokens: crawl.usage.outputTokens + (structureUsage.outputTokens ?? 0),
      searchCount: crawl.usage.searchCount,
      status: "succeeded",
      provider,
      durationMs: Date.now() - startedAt,
    });

    return { profile, pages: crawl.pages };
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordCoreAiRun({
      businessId,
      operation: OPERATION,
      model: modelId,
      promptVersion: UNDERSTAND_BUSINESS_WEBSITE_PROMPT_VERSION,
      inputHash: hashInput({ website, version: UNDERSTAND_BUSINESS_WEBSITE_PROMPT_VERSION, model: modelId }),
      status: "failed",
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
