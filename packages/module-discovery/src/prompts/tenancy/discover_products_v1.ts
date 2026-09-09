export const DISCOVER_PRODUCTS_PROMPT_VERSION = "discover_products_v1";

export function researchProductCatalogPrompt(input: { businessName: string; website: string }): string {
  return `Visit ${input.website}, the website for the business "${input.businessName}", and find every distinct
product or service it sells (not blog posts, not the company itself, not generic pages like "About" or
"Contact").

For each one, report:
1. Its name, exactly as the site names it.
2. Its own specific page URL on the site, if it has one distinct from the homepage (e.g. a
   product/service detail page) -- otherwise say it shares the main site.

If the site only sells one product/service, report just that one. If you cannot find any distinct
products or services (e.g. it's a single-product landing page with no separate catalog), say so
explicitly rather than inventing entries.`;
}

export function structureProductCatalogPrompt(input: { businessName: string; findings: string }): string {
  return `From this research about "${input.businessName}"'s website, extract a clean list of
distinct products/services -- just the name and, if the research found one, that product's own
specific page URL (null if it shares the business's main site).

Research findings:
${input.findings}

Only include products/services the findings actually name -- do not invent any. If the findings
describe only one product, return a list with just that one entry.`;
}
