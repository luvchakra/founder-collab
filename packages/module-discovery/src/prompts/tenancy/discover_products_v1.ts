// v2: reasons about distinct business offerings (grouping SKUs into go-to-market lines)
// instead of reporting one entry per literal product/SKU the site lists.
export const DISCOVER_PRODUCTS_PROMPT_VERSION = "discover_products_v2";

export function researchProductCatalogPrompt(input: { businessName: string; website: string }): string {
  return `Visit ${input.website}, the website for the business "${input.businessName}", and work out
its distinct business offerings -- not a line-by-line scrape of every SKU or catalog entry, but the
actual product lines or services a founder would run a *separate* customer-acquisition strategy for.

Think about it the way a founder would, not the way a catalog page lists things:
- Group items that serve the same customer and the same need into one offering (e.g. a range of
  scents, flavors, sizes or colors of the same product line is one offering, not one per SKU;
  "haircare" isn't five offerings just because there are five haircare SKUs).
- Keep offerings separate only when they're genuinely aimed at different customers, different
  needs, or different price points -- the kind of difference that would call for its own ideal-
  customer profile and outreach, not just a different label on a shelf.
- A site with one real business isn't obligated to have more than one or two offerings. Most small
  businesses have 1-5; a long list is a sign you're listing SKUs, not offerings -- reconsider and
  regroup rather than reporting every item you found.

For each offering, report:
1. A clear, business-facing name (the founder's own name for the line/service, not a single SKU's
   title, unless the whole business really is that one product).
2. One sentence on who buys it and why -- the actual reasoning behind treating it as its own
   offering, not a marketing tagline.
3. Its own page URL if there's one representative page for it (a category/collection page counts)
   -- otherwise say it shares the main site.

If the site sells one real thing, report just that one. If you can't find any real product or
service (e.g. it's a placeholder page with no catalog), say so explicitly rather than inventing
entries.`;
}

export function structureProductCatalogPrompt(input: { businessName: string; findings: string }): string {
  return `From this research about "${input.businessName}"'s website, extract its distinct business
offerings -- product lines or services worth their own go-to-market strategy, not a row per SKU.

If the findings describe many similar items (variants, flavors, sizes of what's clearly the same
line), collapse them into one offering rather than listing each -- name the line, not the SKU. Only
keep entries separate when they're genuinely different offerings: different customers, different
needs, or different price points. A handful of well-reasoned offerings is the right answer far more
often than a long list.

For each offering, give:
- name: the offering's own name (a product-line or service name, not a single SKU title).
- description: one sentence on who buys it and why -- based on what the research actually says,
  not invented.
- website: that offering's own page URL if the research found one (null if it shares the main site).

The findings may be raw page text rather than a summary. When they are, a link right after some
text appears as "label [https://...]" -- that bracketed URL is the href of a link on the page, so
if it immediately follows (or names) something that belongs to an offering, that is very likely a
page for it. Prefer it over guessing or leaving the URL null when one is right there.

Research findings:
${input.findings}

Only report offerings the findings actually support -- do not invent any. If the findings describe
only one real offering, return a list with just that one entry.`;
}
