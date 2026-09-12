import type { ProductProfile } from "../../lib/ai/schemas";
import type { Prospect } from "../../lib/prospects/types";
import type { IcpProfile } from "../../lib/icp/types";

/**
 * DISC-OFFER-P0-12.2: "External Opportunity Research" -- v3 over v2 (v2 left untouched,
 * per this module's own versioned-prompts convention; `ai_runs`' cache keys off this
 * version string, so a schema-shape change gets a real new version rather than silently
 * invalidating/colliding with old cached runs). `researchProspectPrompt` is unchanged
 * from v2 -- it's the *external* web-search question, still correct as-is.
 * `structureResearchPrompt`'s own signature and content changed: it now takes the
 * prospect's own first-party website findings (when a website is on file) *and* the
 * external web-search findings as two separately-labeled blocks, and requires a new
 * `source_type` per evidence item ("first_party" vs "external") so the doc's own
 * "clearly distinguish first-party website evidence from external evidence" holds
 * structurally rather than being left for a reader to guess at from the free-text
 * `source` field alone.
 */
export const RESEARCH_PROSPECT_PROMPT_VERSION = "research_prospect_v3";

export function researchProspectPrompt(input: {
  prospect: Prospect;
  productName: string;
  productProfile: ProductProfile | null;
  icp: IcpProfile | null;
}): string {
  const productContext = input.productProfile
    ? `Our product "${input.productName}": ${input.productProfile.problem} ${input.productProfile.solution}`
    : `Our product: "${input.productName}"`;

  const icpContext = input.icp
    ? `Our ICP: ${input.icp.name}. Buying signals we look for: ${
        input.icp.buying_signals.join(", ") || "none specified"
      }.`
    : "";

  return `Research the company "${input.prospect.company_name}"${
    input.prospect.website ? ` (${input.prospect.website})` : ""
  } using web search.

${productContext}
${icpContext}

Find and report, with sources for each claim:
1. What does this company do? (business model, industry)
2. Any recent news or developments (funding, hiring, product launches, leadership changes, expansions) from the last 6-12 months.
3. Signals that might indicate they'd need a product like ours right now.
4. Likely pain points relevant to what we offer.
5. Who might be the relevant decision maker (role/title, not necessarily a specific name unless publicly known).

For each finding, cite where you found it (what kind of source, its URL, and the date it was published or observed if available) so it can be verified later. If you can't find solid information on something, say so explicitly rather than guessing -- do not invent facts.`;
}

/** DISC-OFFER-P0-12.2: a plain, factual reading of the prospect's own website --
 * deliberately *not* asked to search for opportunity signals (that's the external
 * search's own job); this is only ever "what does this company's own site actually say
 * about itself," so its findings can be honestly labeled first-party evidence rather
 * than a search result that happens to have landed on their site. */
export function firstPartyProspectWebsitePrompt(companyName: string, website: string): string {
  return `Read this company's own website: ${website}

Report what the company "${companyName}" says about itself: what it does, its products/services, industry, size/scale if mentioned, locations, and any leadership/team information shown.

Report only what the website actually states -- do not infer or invent anything it doesn't say. If the site is inaccessible or says nothing useful, say so explicitly.`;
}

export function structureResearchPrompt(input: { externalFindings: string; firstPartyFindings: string | null }): string {
  return `Convert the research findings below into the required structured format. Extract only what's actually stated -- if a field has no supporting information in the findings, use an empty array or a brief note as appropriate.

For the evidence array, extract one entry per distinct sourced claim from EITHER block below:
- statement: the claim itself, in your own concise words.
- source: what kind of source it came from (e.g. "company website", "news article", "LinkedIn profile"), or null if unclear.
- source_url: the URL where it was found, or null.
- observed_at: the date the source was published or the event happened, if stated (any recognizable date format), or null.
- supporting_signal: if this evidence backs one of the buying_signals or recent_events you're also extracting, repeat that signal's exact text here, or null if it doesn't.
- evidence_type: "fact" if the source directly and clearly states this; "inference" if it's reasonably inferred from stated facts; "assumption" if it's a plausible hypothesis not directly supported; "unknown" if there isn't enough information to say.
- confidence: "high"/"medium"/"low" -- how confident you are the statement is accurate, independent of its evidence_type (e.g. a clearly-stated fact from an official source is high confidence; a fact stated by an unclear or possibly outdated source may only be medium or low).
- source_type: "first_party" if this claim comes from the FIRST-PARTY WEBSITE FINDINGS block (the company's own site), or "external" if it comes from the EXTERNAL WEB SEARCH FINDINGS block (news, third-party listings, social media, reviews, etc).

<first_party_website_findings>
${input.firstPartyFindings ?? "(no website on file, or it could not be read)"}
</first_party_website_findings>

<external_web_search_findings>
${input.externalFindings}
</external_web_search_findings>`;
}
