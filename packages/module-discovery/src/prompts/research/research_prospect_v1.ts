import type { ProductProfile } from "../../lib/ai/schemas";
import type { Prospect } from "../../lib/prospects/types";
import type { IcpProfile } from "../../lib/icp/types";

export const RESEARCH_PROSPECT_PROMPT_VERSION = "research_prospect_v1";

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

For each finding, cite where you found it (URL) so it can be verified later. If you can't find solid information on something, say so explicitly rather than guessing -- do not invent facts.`;
}

export function structureResearchPrompt(findings: string): string {
  return `Convert the research findings below into the required structured format. Extract only what's actually stated -- if a field has no supporting information in the findings, use an empty array or a brief note as appropriate. For the evidence array, extract one entry per distinct sourced claim, with its URL when one was given, and classify each as fact/inference/assumption/unknown based on how directly the findings support it.

<findings>
${findings}
</findings>`;
}
