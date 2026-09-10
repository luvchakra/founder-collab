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
 * Researches one website. Tries a direct server-side fetch first (core/ai/fetch-page-
 * text.ts) -- cheap (no LLM call at all), and it preserves each link on the page as an
 * inline "label [url]" annotation, which is exactly what discoverProductsFromWebsite()
 * needs to find each product's own page URL. Only falls back to the provider's own
 * URL-retrieval tool (createUrlContextTools -- Gemini's url_context for Google, web_search
 * for OpenAI/Anthropic) when the direct fetch fails outright (network error, non-2xx, or a
 * JS-rendered page with no extractable text) -- that tool call is strictly more expensive
 * and, being a paraphrased narrative rather than the literal page, was found to reliably
 * *drop* the specific product-page links this feature depends on even when it retrieves
 * the page successfully. Shared by discoverProductsFromWebsite() and understandProduct(),
 * which both had this exact research step.
 *
 * This order was flipped from an earlier version that tried the provider tool first and
 * fell back to the direct fetch only on a reported retrieval failure -- worth keeping
 * straight for anyone touching this again: that direction fixed sites that block a
 * provider's crawler, but did nothing for a site the provider's tool *can* reach, since
 * the tool's own summarized findings still didn't reliably carry per-product URLs. Trying
 * the direct, link-preserving fetch first fixes both cases and costs less on the common
 * path.
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
  let directFetchError: string;
  try {
    const fetchedText = await fetchPageText(website);
    return { findings: fetchedText, inputTokens: 0, outputTokens: 0, searchCount: 0 };
  } catch (error) {
    directFetchError = error instanceof Error ? error.message : String(error);
  }

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

  if (failedRetrieval) {
    throw new AiProviderError(
      "url_retrieval_failed",
      `A direct fetch of ${website} failed (${directFetchError}), and ${provider} could not retrieve ${failedRetrieval.retrievedUrl} either (status: ${failedRetrieval.urlRetrievalStatus}). The site may be blocking automated access, redirecting, or returning an error -- check it loads without a login and isn't behind a WAF/CDN challenge.`,
      provider,
    );
  }
  throw new AiProviderError(
    "no_content_found",
    `A direct fetch of ${website} failed (${directFetchError}), and ${provider} retrieved it but found no useful information there. The page's content may only render after client-side JavaScript runs -- add details manually instead.`,
    provider,
  );
}
