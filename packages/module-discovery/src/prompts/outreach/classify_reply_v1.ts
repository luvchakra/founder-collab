export const CLASSIFY_REPLY_PROMPT_VERSION = "classify_reply_v1";

export function classifyReplyPrompt(input: { productName: string; replyContent: string }): string {
  return `A prospect replied to an outreach message from "${input.productName}". Classify the reply and recommend a next step.

Reply:
"""
${input.replyContent}
"""

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
