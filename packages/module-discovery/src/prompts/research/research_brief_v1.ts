import type { ProductProfile } from "../../lib/ai/schemas";
import type { Prospect } from "../../lib/prospects/types";
import type { IcpProfile } from "../../lib/icp/types";
import type { ProspectResearch } from "../../lib/research/types";
import type { BuyerPersona } from "../../lib/personas/types";
import type { Opportunity } from "../../lib/opportunities/types";
import type { NegativeSignal } from "../../lib/negative-signals/types";

export const RESEARCH_BRIEF_PROMPT_VERSION = "research_brief_v1";

/**
 * DISC-OFFER-P0-06.2: synthesizes the doc's own four genuinely-new brief fields
 * (offering_fit/problem_hypothesis/potential_objection/suggested_opening) from
 * already-gathered structured data -- no new web search, "minimize LLM calls" (CLAUDE.md
 * dev principle #5). "Company"/"Why Now"/"Evidence"/buying-committee context is included
 * here only as *input* grounding, not asked back as output (it already exists as its own
 * field elsewhere -- see the research_briefs migration's own comment).
 */
export function researchBriefPrompt(input: {
  productName: string;
  productProfile: ProductProfile | null;
  icp: IcpProfile;
  prospect: Prospect;
  research: ProspectResearch;
  personas: BuyerPersona[];
  opportunity: Opportunity | null;
  negativeSignals: NegativeSignal[];
}): string {
  const { productName, productProfile, icp, prospect, research, personas, opportunity, negativeSignals } = input;

  return `Write a short internal research brief to help a founder decide whether to pursue this prospect -- not outreach copy, a decision aid.

Offering: "${productName}"${productProfile ? ` -- ${productProfile.problem} ${productProfile.solution}` : ""}
ICP: ${icp.name}. Industries: ${icp.industries.join(", ") || "not specified"}. Typical buyer roles: ${icp.roles.join(", ") || "not specified"}.

Prospect: ${prospect.company_name}${prospect.industry ? ` (${prospect.industry})` : ""}${prospect.description ? ` -- ${prospect.description}` : ""}

Research findings:
Summary: ${research.summary ?? "none"}
Pain points: ${research.pain_points.join(", ") || "none found"}
Buying signals: ${research.buying_signals.join(", ") || "none found"}
Recent events: ${research.recent_events.join(", ") || "none found"}

${opportunity?.why_now ? `Why now (already established): ${opportunity.why_now}` : ""}

Buyer personas we typically sell to: ${personas.map((p) => p.title).join(", ") || "none defined"}

${negativeSignals.length > 0 ? `Known concerns already detected: ${negativeSignals.map((n) => n.detail ?? n.reason).join("; ")}` : "No known concerns detected."}

Based only on the above, determine:
- offering_fit: why this company is (or is not) a genuine fit for the offering.
- problem_hypothesis: the specific problem this company likely has that the offering solves.
- potential_objection: the single most likely reason this prospect says no -- ground it in the known concerns above if any exist, otherwise reason from the research itself; do not invent a generic objection.
- suggested_opening: a one-to-two sentence angle for a first message, tied to specific evidence above.
- confidence: how confident you are in this brief overall, given how much real evidence backs it -- low if the research above is thin.

Do not invent facts not present in the research above.`;
}
