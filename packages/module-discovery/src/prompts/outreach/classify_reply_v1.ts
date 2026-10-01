import { untrusted, UNTRUSTED_RULES } from "../shared/untrusted";
// E2E-DEF-005: the reply is fenced as untrusted data (CLAUDE.md AI rule 1).
export const CLASSIFY_REPLY_PROMPT_VERSION = "classify_reply_v2";

export function classifyReplyPrompt(input: { productName: string; replyContent: string }): string {
  return `A prospect replied to an outreach message from "${input.productName}". Classify the reply and recommend a next step.

Reply:
${UNTRUSTED_RULES}

${untrusted("prospect_reply", input.replyContent)}

Classification options:
- interested: wants to learn more / take a next step
- not_interested: explicitly declining
- question: asking for clarification before deciding
- objection: raising a concern or blocker (price, timing, fit, etc.)
- out_of_office: automated absence reply, not a real response from the person
- unsubscribe: asking to stop being contacted
- other: doesn't fit any of the above

recommended_action must be one short, concrete sentence for the founder -- e.g. "Send pricing details and offer a demo", "No action needed -- automated reply", "Remove from outreach -- do not contact again".`;
}
