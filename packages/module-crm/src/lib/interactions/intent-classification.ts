/**
 * CRM-09.3's "Message Intent Classification" -- the backlog's exact suggested taxonomy.
 * A deterministic keyword heuristic, NOT a real LLM call: this codebase's only sanctioned
 * AI-calling path today is Discovery's own BYOK/provider routing
 * (`module-discovery/src/lib/ai/router.ts`), which is discovery-schema-owned account/
 * workspace machinery with no contract exposing it across the module boundary (CLAUDE.md
 * rule #3 -- module-crm may import only `@cofounderai/core` and other modules'
 * `contract/index.ts`, and discovery exposes no generic "classify this text" contract
 * call). This is the exact same architectural gap `lib/ai/classify-intent.ts` (the old
 * ticket model's own classifier) already documented and worked around -- this file is a
 * new, separate module rather than literally reusing that one, since the old file still
 * actively serves the still-live `crm-meta` (Instagram/Messenger) ticket pipeline with
 * its own different taxonomy; changing its behavior would be an unrelated regression.
 * Same "heuristic today, real LLM later" caveat carries forward: treat every result here
 * as a rough, explainable guess, not a graded model output.
 *
 * "AI is not the sole source of whether an item is visible in the queue" already holds
 * by construction: CRM-09.1's `requires_response` rules engine (deterministic, no AI)
 * decides what the Potential Lost Business queue (CRM-09.2) shows; intent is a display
 * enrichment on those rows, never a visibility gate. "Low-confidence results remain
 * available" holds the same way -- nothing here filters by confidence, so a `0.3`
 * fallback result shows up in the queue exactly like a pattern-matched `0.6` one.
 */
export type MessageIntent =
  | "pricing"
  | "product_question"
  | "availability"
  | "purchase_intent"
  | "appointment"
  | "support"
  | "complaint"
  | "feedback"
  | "review"
  | "general_enquiry"
  | "spam";

export type IntentClassificationResult = { intent: MessageIntent; confidence: number };

const KEYWORD_RULES: { intent: MessageIntent; confidence: number; patterns: RegExp[] }[] = [
  { intent: "spam", confidence: 0.6, patterns: [/\bunsubscribe\b/i, /\bwinner\b/i, /claim your prize/i, /click here now/i] },
  { intent: "complaint", confidence: 0.6, patterns: [/\b(complain(t|ing)?|terrible|awful|worst|disappointed|refund)\b/i] },
  { intent: "review", confidence: 0.55, patterns: [/\b(review|rating|stars?)\b/i] },
  { intent: "feedback", confidence: 0.5, patterns: [/\bfeedback\b/i, /\bsuggestion\b/i] },
  { intent: "support", confidence: 0.55, patterns: [/\b(not working|broken|issue|problem|help me|support)\b/i] },
  { intent: "appointment", confidence: 0.6, patterns: [/\b(appointment|book(ing)?|schedule|visit)\b/i] },
  { intent: "availability", confidence: 0.6, patterns: [/\b(in stock|available|availability)\b/i] },
  { intent: "pricing", confidence: 0.6, patterns: [/\b(price|pricing|cost|how much|quote)\b/i] },
  { intent: "purchase_intent", confidence: 0.65, patterns: [/\b(want to buy|how (do|can) i (buy|order|purchase)|sign me up|place an order)\b/i] },
  { intent: "product_question", confidence: 0.5, patterns: [/\?\s*$/, /\b(what|which|does it|specs?|dimensions?|size|color|material)\b/i] },
];

/**
 * Classifies one inbound message's plain text. Empty content has nothing to classify
 * (`confidence: 0`); unmatched real content falls back to `general_enquiry` at a
 * deliberately low but non-zero confidence, per the backlog's own "low-confidence
 * results remain available" -- there's no separate "unknown" bucket to hide it in.
 */
export function classifyMessageIntent(text: string | null | undefined): IntentClassificationResult {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return { intent: "general_enquiry", confidence: 0 };
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(trimmed))) return { intent: rule.intent, confidence: rule.confidence };
  }
  return { intent: "general_enquiry", confidence: 0.3 };
}
