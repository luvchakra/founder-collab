import { UNTRUSTED_RULES, untrusted } from "../shared/untrusted";

export const INVESTOR_RESEARCH_PROMPT_VERSION = "funding_investor_research_v1";

/** FND-08/16, step 1 — web research on one investor. */
export function investorResearchPrompt(input: { name: string; website: string | null }): string {
  return [
    `Research the investor "${input.name}"${input.website ? ` (website: ${input.website})` : ""} using web search.`,
    "Find: investment thesis, stage and sector focus, geography, typical cheque size, notable and recent investments, and partners.",
    "For every fact, give the URL of the page it came from. Report only what the sources say; if something is not found, say it was not found.",
  ].join("\n");
}

/** Step 2 — structure the findings. The search output is untrusted web content. */
export function structureInvestorResearchPrompt(findings: string): string {
  return [
    "Structure the research notes below into findings.",
    UNTRUSTED_RULES,
    "Each finding must carry the exact source URL from the notes when there is one. Findings without a source URL are inferences and must say so.",
    "Do not add anything that is not in the notes.",
    "",
    untrusted("web_research_notes", findings),
  ].join("\n");
}
