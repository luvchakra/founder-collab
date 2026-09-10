import { generateText, type LanguageModel } from "ai";
import type { ToolSet } from "@ai-sdk/provider-utils";
import type { AiProvider } from "@cofounderai/core/ai/model-registry";
import { fetchPageText } from "@cofounderai/core/ai/fetch-page-text";
import { AiProviderError } from "./router";

export type WebsiteResearchResult = {
  findings: string;
  inputTokens: number;
  outputTokens: number;
  searchCount: number;
};

/**
 * Researches one website via the provider's own URL-retrieval tool (createUrlContextTools
 * -- Gemini's dedicated url_context tool for Google, web_search for OpenAI/Anthropic),
 * falling back to a direct server-side fetch (core/ai/fetch-page-text.ts) when that tool
 * reports a retrieval failure or comes back with nothing usable. Shared by
 * discoverProductsFromWebsite() and understandProduct(), which both had this exact
 * research step and, before this file existed, surfaced a raw retrieval failure straight
 * to the founder with no fallback attempted -- a real, reported failure mode
 * (meridianhometech.in: Gemini's own crawler got URL_RETRIEVAL_STATUS_ERROR on a site that
 * loads fine in an ordinary browser).
 *
 * Still throws AiProviderError when both attempts fail, worded to say so -- callers don't
 * need to change their own error handling, only stop duplicating this retry logic.
 */
export async function researchWebsite(
  model: LanguageModel,
  tools: ToolSet,
  prompt: string,
  website: string,
  provider: AiProvider,
): Promise<WebsiteResearchResult> {
  const searchResponse = await generateText({ model, tools, prompt });

  const googleMetadata = searchResponse.providerMetadata?.google as unknown as
    | { urlContextMetadata?: { urlMetadata?: { retrievedUrl: string; urlRetrievalStatus: string }[] } }
    | undefined;
  const urlMetadata = googleMetadata?.urlContextMetadata?.urlMetadata;
  const failedRetrieval = urlMetadata?.find((entry) => entry.urlRetrievalStatus !== "URL_RETRIEVAL_STATUS_SUCCESS");
  const toolFindings = searchResponse.text.trim();

  const usage = {
    inputTokens: searchResponse.usage.inputTokens ?? 0,
    outputTokens: searchResponse.usage.outputTokens ?? 0,
    searchCount: searchResponse.toolCalls.length,
  };

  if (!failedRetrieval && toolFindings) {
    return { findings: toolFindings, ...usage };
  }

  try {
    const fetchedText = await fetchPageText(website);
    return { findings: fetchedText, ...usage };
  } catch (fallbackError) {
    const fallbackDetail = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    if (failedRetrieval) {
      throw new AiProviderError(
        "url_retrieval_failed",
        `${provider} could not retrieve ${failedRetrieval.retrievedUrl} (status: ${failedRetrieval.urlRetrievalStatus}), and a direct fetch also failed: ${fallbackDetail} The site may be blocking automated access, redirecting, or returning an error -- check it loads without a login and isn't behind a WAF/CDN challenge.`,
        provider,
      );
    }
    throw new AiProviderError(
      "no_content_found",
      `${provider} retrieved ${website} but found no useful information there, and a direct fetch also failed: ${fallbackDetail} The page's content may only render after client-side JavaScript runs -- add details manually instead.`,
      provider,
    );
  }
}
