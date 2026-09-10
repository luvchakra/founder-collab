import type { DetectedIntent } from "./classify-intent";

/**
 * Draft-reply generation for A3's `draft_approve` instant-reply mode
 * (docs/design/crm-module-design.md Part A.3) -- same "not a real AI call" caveat as
 * classify-intent.ts's own docstring: this picks a template by detected intent rather
 * than generating anything, so `draft_approve` has a real draft to show an agent instead
 * of silently sending nothing (the design doc's own documented current behavior before
 * this file existed). A human still approves or edits before it sends -- that discipline
 * doesn't change just because the draft's origin is a template instead of a model.
 *
 * Upgrading this to a real AI-drafted reply needs the same cross-module contract call
 * classify-intent.ts's docstring describes; swap this function's body for that call
 * once it exists, the caller (ingest-inbound-message.ts) doesn't need to change.
 */
export function draftReply(intent: DetectedIntent, businessName: string): string {
  switch (intent) {
    case "interested":
      return `Thanks for your interest! Someone from ${businessName} will follow up shortly with more details -- happy to answer any questions in the meantime.`;
    case "question":
      return `Thanks for your question -- someone from ${businessName} will get back to you with an answer shortly.`;
    case "objection":
      return `Thanks for sharing that -- someone from ${businessName} will follow up to address your concerns directly.`;
    case "not_interested":
      return `No problem, thanks for letting us know. Feel free to reach out again if anything changes.`;
    case "out_of_office":
      return `Thanks for the heads up -- we'll follow up once you're back.`;
    case "unsubscribe":
      return `You've been noted -- you won't hear from us again on this channel.`;
    case "other":
    default:
      return `Thanks for reaching out to ${businessName} -- someone from our team will follow up shortly.`;
  }
}
