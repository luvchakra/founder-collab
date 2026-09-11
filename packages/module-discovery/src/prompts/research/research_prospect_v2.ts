import type { ProductProfile } from "../../lib/ai/schemas";
import type { Prospect } from "../../lib/prospects/types";
import type { IcpProfile } from "../../lib/icp/types";

/**
 * DISC-OFFER-P0-06.1: "Evidence-Backed Research" -- v2 over v1 (the file that version
 * superseded is left untouched, per CLAUDE.md's own versioned-prompts convention;
 * `ai_runs`' cache keys off this version string, so a schema-shape change gets a real
 * new version rather than silently invalidating/colliding with old cached runs).
 * `structureResearchPrompt` now asks for the doc's own fuller evidence shape
 * (source description, source date, supporting signal, and a confidence distinct from
 * evidence_type) -- see `EvidenceItemSchema` in `lib/ai/schemas.ts` for the exact
 * fields. `researchProspectPrompt` itself is unchanged from v1: it already asked the
 * model to cite a URL per claim and to say so explicitly rather than guess, which the
 * doc's own "never invent evidence" instruction already covers.
 */
export const RESEARCH_PROSPECT_PROMPT_VERSION = "research_prospect_v2";

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

export function structureResearchPrompt(findings: string): string {
  return `Convert the research findings below into the required structured format. Extract only what's actually stated -- if a field has no supporting information in the findings, use an empty array or a brief note as appropriate.

For the evidence array, extract one entry per distinct sourced claim:
- statement: the claim itself, in your own concise words.
- source: what kind of source it came from (e.g. "company website", "news article", "LinkedIn profile"), or null if unclear.
- source_url: the URL where it was found, or null.
- observed_at: the date the source was published or the event happened, if stated (any recognizable date format), or null.
- supporting_signal: if this evidence backs one of the buying_signals or recent_events you're also extracting, repeat that signal's exact text here, or null if it doesn't.
- evidence_type: "fact" if the source directly and clearly states this; "inference" if it's reasonably inferred from stated facts; "assumption" if it's a plausible hypothesis not directly supported; "unknown" if there isn't enough information to say.
- confidence: "high"/"medium"/"low" -- how confident you are the statement is accurate, independent of its evidence_type (e.g. a clearly-stated fact from an official source is high confidence; a fact stated by an unclear or possibly outdated source may only be medium or low).

<findings>
${findings}
</findings>`;
}
