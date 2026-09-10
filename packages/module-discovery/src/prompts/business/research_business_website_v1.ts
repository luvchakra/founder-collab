export const RESEARCH_BUSINESS_WEBSITE_PROMPT_VERSION = "research_business_website_v1";

export function researchBusinessWebsitePrompt(input: { website: string }): string {
  return `Research this business by visiting and reading its website: ${input.website}

Find and report:
1. The business's real, official name (as it refers to itself, not the domain name).
2. What the business does -- its products/services and who it serves.
3. Anything else on the site that helps describe the business at a glance (industry, location, notable specialization).

Report only what the website actually states -- do not infer or invent anything it doesn't say. If the business name isn't clear from the site, say so explicitly rather than guessing.`;
}
