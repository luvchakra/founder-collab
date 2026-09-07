export const RESEARCH_PRODUCT_WEBSITE_PROMPT_VERSION = "research_product_website_v1";

export function researchProductWebsitePrompt(input: { productName: string; website: string }): string {
  return `Research the product "${input.productName}" by visiting and reading its website: ${input.website}

Find and report everything the website says about:
1. What the product/category is (what kind of product this is).
2. What problem it solves and how (the solution).
3. Key features.
4. What makes it different from alternatives (differentiators).
5. Target industries and target roles/buyers.
6. Common use cases.
7. Pricing, if mentioned anywhere on the site.

Report only what the website actually states -- do not infer or invent anything it doesn't say. If a section above isn't covered on the site, say so explicitly rather than guessing.`;
}
