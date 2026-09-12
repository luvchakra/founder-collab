import { streamObject } from "ai";
import { recordAiRun as recordCoreAiRun } from "@cofounderai/core/ai-usage/mutations";
import {
  extractBusinessOfferingsPrompt,
  EXTRACT_BUSINESS_OFFERINGS_PROMPT_VERSION,
} from "../../prompts/business/extract_business_offerings_v1";
import { hashInput } from "./hash";
import { WebsiteOfferingExtractionSchema, type WebsiteOfferingCandidate } from "./schemas";
import { resolveAiModelForAccount, toAiProviderError } from "./router";
import { sanitizeOfferingCandidates } from "../website-onboarding/sanitize-offerings";

const OPERATION = "extract_business_offerings";

/**
 * DISC-OFFER-P0-09.3 "AI Offering Extraction" -- structures the business's distinct
 * commercial Offerings out of the SAME combined crawl findings
 * `understandBusinessWebsite()` already fetched (DISC-OFFER-P0-09.2's own
 * `crawlWebsite()`), rather than crawling the website a second time: "never send
 * unnecessary context to an LLM" cuts both ways here -- reusing findings already in hand
 * avoids re-fetching pages just to ask a different question about the same content.
 *
 * Business_id-scoped ai_runs logging, same reasoning as `understandBusinessWebsite()`'s
 * own doc comment: this runs before any offering/workspace exists to key discovery's own
 * workspace-scoped ai_runs/usage-limit machinery off. Its own `ai_runs` row, separate from
 * `understand_business_website`'s -- a distinct operation with its own prompt/schema, the
 * same "one row per operation" discipline every other lib/ai/*.ts function in this module
 * follows individually rather than folding unrelated structuring calls into one shared row.
 *
 * Runs the model's own consolidation (the prompt's explicit "don't create an offering per
 * feature" instruction) through `sanitizeOfferingCandidates()` afterward -- structural
 * enforcement of "extracted facts are traceable to source pages" and a deterministic
 * backstop against an exact-name duplicate slipping through, not a substitute for the
 * prompt's own consolidation instruction.
 */
export async function extractBusinessOfferings(
  businessId: string,
  accountId: string,
  website: string,
  findings: string,
  crawledPageUrls: string[],
  /** Same shape as `understandBusinessWebsite()`'s own `onProgress` -- the AI SDK's
   * streamed partial object, forwarded as-is for live "Found 2 offerings..." progress. */
  onProgress?: (partial: Record<string, unknown>) => void,
): Promise<WebsiteOfferingCandidate[]> {
  const { provider, modelId, model, modelAtTier } = await resolveAiModelForAccount(accountId, OPERATION);

  const prompt = extractBusinessOfferingsPrompt({ website, findings, knownPageUrls: crawledPageUrls });
  const inputHash = hashInput({ findings, version: EXTRACT_BUSINESS_OFFERINGS_PROMPT_VERSION, model: modelId });

  const startedAt = Date.now();
  try {
    const response = streamObject({
      model: modelAtTier("balanced"),
      schema: WebsiteOfferingExtractionSchema,
      prompt,
    });

    if (onProgress) {
      for await (const partial of response.partialObjectStream) {
        onProgress(partial as Record<string, unknown>);
      }
    }

    const object = await response.object;
    const usage = await response.usage;

    await recordCoreAiRun({
      businessId,
      operation: OPERATION,
      model: modelId,
      promptVersion: EXTRACT_BUSINESS_OFFERINGS_PROMPT_VERSION,
      inputHash,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      status: "succeeded",
      provider,
      durationMs: Date.now() - startedAt,
    });

    return sanitizeOfferingCandidates(object.offerings, crawledPageUrls);
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordCoreAiRun({
      businessId,
      operation: OPERATION,
      model: modelId,
      promptVersion: EXTRACT_BUSINESS_OFFERINGS_PROMPT_VERSION,
      inputHash,
      status: "failed",
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
