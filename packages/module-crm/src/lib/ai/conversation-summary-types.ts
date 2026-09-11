import { z } from "zod";

/**
 * Split out of `conversation-summary.ts` so a client component (the "Generate summary"
 * card) can import the result shape/vocabulary without pulling that file's server-only
 * imports (`db/server`, `requireModule`, ...) into the browser bundle -- `next build`
 * fails otherwise, since those imports reach Node-only APIs no client bundle can ship.
 */

/** CRM-12.4's own closed vocabulary -- the model picks one of these, never free text,
 * so "next action" is always a concrete, actionable label rather than a sentence a
 * founder has to interpret. */
export const NEXT_BEST_ACTIONS = [
  "answer_now",
  "send_price",
  "check_inventory",
  "call_contact",
  "send_quote",
  "follow_up_2_days",
  "escalate_complaint",
  "request_missing_information",
] as const;

export const NEXT_BEST_ACTION_LABEL: Record<(typeof NEXT_BEST_ACTIONS)[number], string> = {
  answer_now: "Answer now",
  send_price: "Send price",
  check_inventory: "Check inventory",
  call_contact: "Call contact",
  send_quote: "Send quote",
  follow_up_2_days: "Follow up in 2 days",
  escalate_complaint: "Escalate complaint",
  request_missing_information: "Request missing information",
};

export const ConversationSummarySchema = z.object({
  summary: z.string().min(1),
  unresolvedQuestions: z.array(z.string()),
  promisedActions: z.array(z.string()),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  // CRM-12.4's "Next Best Action" -- folded into this same call/cache rather than a
  // second AI request over the same conversation context (CLAUDE.md principle 5,
  // "minimize LLM calls"). Advisory only: the UI never acts on this by itself --
  // "the model may prioritize; it must not silently execute external actions."
  nextBestAction: z.enum(NEXT_BEST_ACTIONS),
  nextBestActionRationale: z.string().min(1),
});

export type ConversationSummaryResult = z.infer<typeof ConversationSummarySchema>;
