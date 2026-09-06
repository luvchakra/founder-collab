import type { ProductProfile } from "../../lib/ai/schemas";
import type { Prospect } from "../../lib/prospects/types";
import type { IcpProfile } from "../../lib/icp/types";
import type { ProspectResearch } from "../../lib/research/types";
import type { ProspectScore } from "../../lib/scoring/types";
import type { Contact } from "../../lib/contacts/types";

export const GENERATE_STRATEGY_PROMPT_VERSION = "generate_strategy_v1";

export function generateStrategyPrompt(input: {
  productName: string;
  productProfile: ProductProfile;
  icp: IcpProfile;
  prospect: Prospect;
  research: ProspectResearch;
  score: ProspectScore | null;
  contact: Contact | null;
}): string {
  const contactLine = input.contact
    ? `Targeting contact: ${[input.contact.first_name, input.contact.last_name].filter(Boolean).join(" ") || "(name unknown)"}${input.contact.job_title ? `, ${input.contact.job_title}` : ""}.`
    : "No specific contact selected yet -- write for the ICP's typical buyer role.";

  return `Do not just write "an email." First determine the actual strategy for approaching this prospect, grounded in the research below -- not generic advice.

Product: "${input.productName}" -- ${input.productProfile.problem} ${input.productProfile.solution}

ICP: ${input.icp.name}. Typical buyer roles: ${input.icp.roles.join(", ") || "not specified"}.

Prospect: ${input.prospect.company_name}${input.prospect.industry ? ` (${input.prospect.industry})` : ""}.
${contactLine}

Research findings:
Summary: ${input.research.summary ?? "none"}
Pain points: ${input.research.pain_points.join(", ") || "none found"}
Buying signals: ${input.research.buying_signals.join(", ") || "none found"}
Recent events: ${input.research.recent_events.join(", ") || "none found"}
${input.score ? `Fit score: ${input.score.overall_score}/100 (${input.score.reasoning ?? ""})` : ""}

Determine:
- Why this company, specifically (tie to the research above, not generic industry statements).
- Why now (tie to a specific signal or event if one exists; if none exists, say the timing rationale is weaker and lean on ICP fit instead).
- The single best angle to lead with.
- The most appropriate channel for this prospect and contact.
- A concrete, low-friction call to action.

Do not invent facts not present in the research above.`;
}
