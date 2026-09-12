import type { LanguageModel } from "ai";
import type { ToolSet } from "@ai-sdk/provider-utils";
import type { AiProvider } from "@cofounderai/core/ai/model-registry";
import { researchBusinessWebsitePrompt } from "../../prompts/business/research_business_website_v1";
import { researchWebsite, type WebsiteResearchResult } from "./research-website";
import { AiProviderError } from "./router";
import { buildCrawlPlan, extractPageLinks, WEBSITE_PAGE_CATEGORY_LABEL, type WebsitePageCategory } from "../website-onboarding/crawl-plan";
import { fetchRobotsRules, isPathAllowed } from "../website-onboarding/robots";

export type CrawledPage = {
  url: string;
  category: WebsitePageCategory;
  status: "succeeded" | "failed";
  error: string | null;
  fetchedAt: string;
};

export type CrawlUsage = { inputTokens: number; outputTokens: number; searchCount: number };

export type CrawlResult = {
  /** Every page actually attempted -- the homepage plus whichever of the plan's own pages
   * robots.txt allowed -- in fetch order, each carrying its own outcome. A page robots.txt
   * disallows is silently left out of the plan entirely (never attempted, so never
   * recorded here); the doc's own "respect access/robots restrictions" is about not
   * fetching a disallowed page at all, not about reporting that one was skipped. */
  pages: CrawledPage[];
  /** Every succeeded page's own findings, concatenated into one blob for the structuring
   * prompt, each block headed by its category label and source URL so the model (and
   * anyone reading a captured prompt later) can see which page a fact came from. */
  combinedFindings: string;
  usage: CrawlUsage;
};

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function addUsage(a: CrawlUsage, b: WebsiteResearchResult): CrawlUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    searchCount: a.searchCount + b.searchCount,
  };
}

/**
 * DISC-OFFER-P0-09.2's own orchestrator: fetches the homepage (exactly as 09.1's
 * understandBusinessWebsite already did), extracts candidate internal-page links directly
 * from its raw findings text (crawl-plan.ts's own extractPageLinks -- no AI call needed
 * just to find links), then visits a bounded, deduplicated, priority-ordered, same-domain,
 * robots-respecting subset of those pages (crawl-plan.ts's own buildCrawlPlan) using the
 * exact same per-page fetch mechanism (research-website.ts's researchWebsite: a direct
 * fetch first, falling back to the provider's own URL-retrieval tool for a JS-heavy page --
 * this story's own "support JavaScript-heavy sites through the available website
 * inspection mechanism," reused rather than re-implemented per page).
 *
 * "Support partial success": only the homepage fetch failing throws (there is nothing to
 * build a profile from at all without it, the same all-or-nothing failure 09.1 already
 * had); every secondary page is fetched inside its own try/catch, and a failure there is
 * recorded as a failed CrawledPage and simply skipped from `combinedFindings` -- the run
 * still succeeds with whatever pages *did* work.
 */
export async function crawlWebsite(
  homepageUrl: string,
  model: LanguageModel,
  tools: ToolSet,
  provider: AiProvider,
  /** Called once per page as it's attempted (in fetch order) -- lets a caller (the
   * streaming route handler) show live "Crawling: About page..." progress the same way
   * understandBusinessWebsite()'s own onProgress already streams structuring progress. */
  onPage?: (page: CrawledPage) => void,
  maxAdditionalPages?: number,
): Promise<CrawlResult> {
  let origin: string;
  try {
    origin = new URL(homepageUrl).origin;
  } catch {
    origin = homepageUrl;
  }
  const robots = await fetchRobotsRules(origin);

  if (!isPathAllowed(robots, pathOf(homepageUrl))) {
    throw new AiProviderError(
      "robots_disallowed",
      `${origin}/robots.txt disallows crawling ${homepageUrl}. Add the business's details manually instead.`,
    );
  }

  const homeResearch = await researchWebsite(
    model,
    tools,
    researchBusinessWebsitePrompt({ website: homepageUrl }),
    homepageUrl,
    provider,
  );

  const pages: CrawledPage[] = [];
  const findingsBlocks: string[] = [];
  let usage: CrawlUsage = { inputTokens: 0, outputTokens: 0, searchCount: 0 };

  const homePage: CrawledPage = { url: homepageUrl, category: "home", status: "succeeded", error: null, fetchedAt: new Date().toISOString() };
  pages.push(homePage);
  onPage?.(homePage);
  findingsBlocks.push(formatBlock("Home", homepageUrl, homeResearch.findings));
  usage = addUsage(usage, homeResearch);

  const links = extractPageLinks(homeResearch.findings);
  const plan = buildCrawlPlan(homepageUrl, links, maxAdditionalPages);

  for (const entry of plan) {
    if (!isPathAllowed(robots, pathOf(entry.url))) continue; // never attempted -- robots disallows it

    try {
      const pageResearch = await researchWebsite(
        model,
        tools,
        researchBusinessWebsitePrompt({ website: entry.url }),
        entry.url,
        provider,
      );
      usage = addUsage(usage, pageResearch);
      findingsBlocks.push(formatBlock(WEBSITE_PAGE_CATEGORY_LABEL[entry.category], entry.url, pageResearch.findings));
      const page: CrawledPage = { url: entry.url, category: entry.category, status: "succeeded", error: null, fetchedAt: new Date().toISOString() };
      pages.push(page);
      onPage?.(page);
    } catch (error) {
      const page: CrawledPage = {
        url: entry.url,
        category: entry.category,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        fetchedAt: new Date().toISOString(),
      };
      pages.push(page);
      onPage?.(page);
    }
  }

  return { pages, combinedFindings: findingsBlocks.join("\n\n"), usage };
}

function formatBlock(label: string, url: string, findings: string): string {
  return `Page: ${label} (${url})\n${findings}`;
}
