/**
 * DISC-OFFER-P0-09.2's own pure crawl-planning logic: turns the homepage's raw findings
 * text (the "label [absolute-url]" annotations `fetchPageText` already preserves -- see
 * that file's own doc comment) into a bounded, deduplicated, same-domain, priority-ordered
 * list of pages worth visiting next. Pure and deterministic throughout (CLAUDE.md dev
 * principle #4) -- categorizing a link by keyword and picking which ones to keep needs no
 * AI call, and doing it this way means the model is never asked to invent a page that
 * isn't actually linked (09.1's own "AI never invents missing information," extended to
 * "AI never invents a page to crawl" here).
 *
 * Deliberately does not depend on the AI-structured `relevant_pages` field 09.1 already
 * produces: that field only exists *after* the structuring call finishes, which would mean
 * the crawl plan couldn't be built until an AI call had already run once -- a real
 * chicken-and-egg problem. Extracting links directly from the same raw findings text the
 * structuring prompt is about to read from is both simpler and faster (no extra AI round
 * trip just to find links).
 */

export const WEBSITE_PAGE_CATEGORY_VALUES = [
  "home",
  "about",
  "products",
  "services",
  "solutions",
  "industries",
  "use_cases",
  "pricing",
  "case_studies",
  "customers",
  "resources",
  "faq",
  "contact",
  "other",
] as const;
export type WebsitePageCategory = (typeof WEBSITE_PAGE_CATEGORY_VALUES)[number];

/** Shared display label for a page category -- used both to head each page's own findings
 * block in the structuring prompt (lib/ai/website-crawl.ts) and in the crawl-progress UI
 * (WebsiteOnboardingPanel), so the two never drift apart. */
export const WEBSITE_PAGE_CATEGORY_LABEL: Record<WebsitePageCategory, string> = {
  home: "Home",
  about: "About",
  products: "Products",
  services: "Services",
  solutions: "Solutions",
  industries: "Industries",
  use_cases: "Use Cases",
  pricing: "Pricing",
  case_studies: "Case Studies",
  customers: "Customers",
  resources: "Resources",
  faq: "FAQ",
  contact: "Contact",
  other: "Other",
};

/** The doc's own literal priority order (DISC-OFFER-P0-09.2's "Inspect relevant internal
 * pages, prioritizing: Home / About / Products / Services / Solutions / Industries / Use
 * Cases / Pricing / Case Studies / Customers / Resources / FAQ / Contact"). "other" is
 * lowest priority and is never picked when the page cap is already met by higher-priority
 * categories. */
const CATEGORY_PRIORITY: WebsitePageCategory[] = [
  "home",
  "about",
  "products",
  "services",
  "solutions",
  "industries",
  "use_cases",
  "pricing",
  "case_studies",
  "customers",
  "resources",
  "faq",
  "contact",
  "other",
];

/** Keyword match against a link's own label and URL path -- checked in priority order so
 * a link matching more than one category's keywords (e.g. "Solutions & Services") settles
 * on whichever category comes first in CATEGORY_PRIORITY. */
const CATEGORY_KEYWORDS: Record<Exclude<WebsitePageCategory, "home" | "other">, string[]> = {
  about: ["about", "about-us", "who-we-are", "company", "team"],
  products: ["product", "products", "catalog"],
  services: ["service", "services"],
  solutions: ["solution", "solutions"],
  industries: ["industry", "industries", "verticals", "sectors"],
  use_cases: ["use-case", "use-cases", "usecase", "usecases", "use cases"],
  pricing: ["pricing", "plans", "cost"],
  case_studies: ["case-stud", "case stud", "success-stor", "success stor", "casestudy", "casestudies"],
  customers: ["customer", "customers", "clients"],
  resources: ["resource", "resources", "blog", "insights"],
  faq: ["faq", "faqs", "frequently-asked"],
  contact: ["contact", "contact-us", "get-in-touch"],
};

export type CrawlLink = { label: string; url: string };

/**
 * Matches the exact "label [absolute-url]" annotation `fetchPageText` inlines for every
 * anchor on a fetched page. Only finds links when the homepage findings actually came from
 * a direct fetch (as opposed to a provider tool's paraphrased summary, which carries no
 * such annotations) -- yielding zero candidate links in that case is a correct, honest
 * "no further pages known," not a bug; the crawl still proceeds with the homepage alone
 * (this story's own "partial crawl results remain usable").
 *
 * The flattened text has no marker for where an anchor's own label starts -- it runs
 * directly on from whatever ordinary text preceded it on the page. `extractLabel` below
 * makes a best-effort guess (text after the nearest sentence/list delimiter, capped to the
 * last few words) rather than trying to be exact: the label is only ever a secondary,
 * supplementary signal for `categorizeLink` -- the URL's own path is the primary one, and
 * is unaffected by any imprecision here.
 */
export function extractPageLinks(findings: string): CrawlLink[] {
  const links: CrawlLink[] = [];
  const pattern = /([^[\]]*)\[(https?:\/\/[^\s\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(findings)) !== null) {
    const url = match[2]?.trim() ?? "";
    if (!url) continue;
    links.push({ label: extractLabel(match[1] ?? ""), url });
  }
  return links;
}

const LABEL_DELIMITERS = /[.|•;]/g;

function extractLabel(precedingText: string): string {
  const trimmed = precedingText.trim();
  const pieces = trimmed.split(LABEL_DELIMITERS);
  const lastPiece = (pieces[pieces.length - 1] ?? "").trim();
  const words = lastPiece.split(/\s+/).filter(Boolean);
  return words.slice(-6).join(" ");
}

/** Categorizes one link by keyword match against its own label and URL path. Checked in
 * CATEGORY_PRIORITY order, first match wins. */
export function categorizeLink(link: CrawlLink): WebsitePageCategory {
  let path = "";
  try {
    path = new URL(link.url).pathname.toLowerCase();
  } catch {
    path = "";
  }
  const label = link.label.toLowerCase();
  for (const category of CATEGORY_PRIORITY) {
    if (category === "home" || category === "other") continue;
    const keywords = CATEGORY_KEYWORDS[category];
    if (keywords.some((keyword) => label.includes(keyword) || path.includes(keyword))) {
      return category;
    }
  }
  return "other";
}

/** Normalizes a URL for dedup comparison only (case-insensitive host, no trailing slash,
 * no query string or fragment -- the same two URLs with a different tracking query param
 * are the same page for crawl purposes). Not exported as the "real" URL to fetch; callers
 * keep the original `url` for that and only use this for the dedup Set key. */
function dedupeKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

export type CrawlPlanEntry = { url: string; category: WebsitePageCategory };

const DEFAULT_MAX_ADDITIONAL_PAGES = 8;

/**
 * Builds the bounded set of additional pages to crawl beyond the homepage (already
 * fetched by the caller before this runs).
 *
 * - "Stay within the supplied domain by default": links to a different hostname are
 *   dropped outright.
 * - "Deduplicate pages": the homepage itself and repeat links (including a link back to
 *   the homepage) are dropped; at most one URL is kept per category, so multiple links
 *   that all land in the same category (e.g. three separate "Products" nav links) don't
 *   crowd out other categories.
 * - "Prevent infinite crawling": capped at `maxPages` (default 8) and ordered by
 *   CATEGORY_PRIORITY -- when there are more distinct categories than the cap allows,
 *   the lowest-priority ones (typically "other") are the ones left out.
 */
export function buildCrawlPlan(
  homepageUrl: string,
  links: CrawlLink[],
  maxPages: number = DEFAULT_MAX_ADDITIONAL_PAGES,
): CrawlPlanEntry[] {
  const homepageKey = dedupeKey(homepageUrl);
  let homepageOrigin: string;
  try {
    homepageOrigin = new URL(homepageUrl).origin;
  } catch {
    return [];
  }

  const byCategory = new Map<WebsitePageCategory, string>();
  const seenKeys = new Set<string>(homepageKey ? [homepageKey] : []);

  for (const link of links) {
    let parsed: URL;
    try {
      parsed = new URL(link.url);
    } catch {
      continue;
    }
    if (parsed.origin !== homepageOrigin) continue; // stay within the supplied domain

    const key = dedupeKey(link.url);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);

    const category = categorizeLink(link);
    if (category === "home") continue;
    if (!byCategory.has(category)) {
      byCategory.set(category, link.url);
    }
  }

  const plan: CrawlPlanEntry[] = [];
  for (const category of CATEGORY_PRIORITY) {
    const url = byCategory.get(category);
    if (!url) continue;
    plan.push({ url, category });
    if (plan.length >= maxPages) break;
  }
  return plan;
}
