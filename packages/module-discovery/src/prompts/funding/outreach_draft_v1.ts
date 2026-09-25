import { UNTRUSTED_RULES, untrusted } from "../shared/untrusted";

export const OUTREACH_DRAFT_PROMPT_VERSION = "funding_outreach_draft_v1";

/** FND-11/16 — a personalised first email to an investor. The draft is saved as a draft
 * and cannot be sent without a person approving it. */
export function outreachDraftPrompt(input: {
  investor: string;
  research: { id: string; field: string; provenance: string; content: string }[];
  profile: string;
  round: string | null;
  context: string;
}): string {
  return [
    "You are helping a founder write a short, specific first email to a potential investor.",
    UNTRUSTED_RULES,
    "Personalise it only with research findings provided below, and list the ids of the findings you relied on in usedFindingIds.",
    "Findings marked ai_inferred are unverified: do not present them as fact in the email.",
    "Do not invent traction, investors, revenue or any number not present in the founder's profile.",
    "Keep it under 180 words, with one clear ask.",
    "",
    untrusted("investor", input.investor),
    ...input.research.map((r) => untrusted(`research id=${r.id} field=${r.field} provenance=${r.provenance}`, r.content)),
    untrusted("founder_funding_profile", input.profile),
    untrusted("round", input.round),
    untrusted("discovery_context", input.context),
  ].join("\n");
}
