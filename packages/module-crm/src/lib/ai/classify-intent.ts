/**
 * Detected-intent classification for inbound CRM messages (docs/design/crm-module-
 * design.md Part A.3 / Part B.3) -- shares module-discovery's own reply-classification
 * taxonomy (lib/ai/schemas.ts#ReplyClassificationSchema: "one shared taxonomy across CRM
 * and Discovery, not two teams inventing separate labels for the same underlying
 * signal", per the design doc's own A3 section) without importing discovery's internals
 * (CLAUDE.md rule #3 -- module-crm may only import another module's `contract/index.ts`,
 * and discovery exposes no text-classification contract call today).
 *
 * This is a deterministic keyword heuristic, NOT a real AI call -- module-discovery's
 * `resolveAiModel`/BYOK routing is discovery-schema-owned account/workspace machinery
 * with no contract exposing it across the module boundary, so module-crm has no
 * sanctioned way to call a real LLM today. It exists so B3's `detected_intent_filter`
 * routing condition and A3's `draft_approve` mode have a real, working value to route
 * and draft against right now, rather than staying schema-only columns nothing ever
 * populates.
 *
 * To upgrade this to real AI: expose a generic "generate/classify text for this
 * workspace's connected provider" function from module-discovery's own contract/
 * index.ts (the design doc's own suggested follow-up), then have this file call that
 * instead of the keyword table below. Until then, treat every result here as a rough,
 * explainable guess a human should double-check, not a graded model output.
 */
export type DetectedIntent =
  | "interested"
  | "not_interested"
  | "question"
  | "objection"
  | "out_of_office"
  | "unsubscribe"
  | "other";

const KEYWORD_RULES: { intent: DetectedIntent; patterns: RegExp[] }[] = [
  { intent: "unsubscribe", patterns: [/\bunsubscribe\b/i, /\bstop\b/i, /\bopt.?out\b/i, /do not contact/i] },
  {
    intent: "out_of_office",
    patterns: [/out of office/i, /\bo+oo\b/i, /on leave/i, /on vacation/i, /back (on|in|by)\b/i],
  },
  {
    intent: "not_interested",
    patterns: [/not interested/i, /no thanks/i, /not (right now|looking)/i, /please remove/i],
  },
  {
    intent: "objection",
    patterns: [/too expensive/i, /too (costly|pricey)/i, /can'?t afford/i, /already (use|have|working with)/i, /not sure (about|this)/i, /concerned about/i],
  },
  {
    intent: "interested",
    patterns: [/\binterested\b/i, /sounds good/i, /tell me more/i, /would like to/i, /sign me up/i, /how (do|can) (i|we) (get|start|buy)/i],
  },
  {
    intent: "question",
    patterns: [/\?\s*$/, /^\s*(what|when|where|how|why|who|can|could|does|is|are)\b/i],
  },
];

/**
 * Classifies one inbound message's plain text. Returns "other" when nothing matches --
 * the same "no confident answer" default a real classifier would need a fallback
 * bucket for anyway.
 */
export function classifyIntent(text: string): DetectedIntent {
  const trimmed = text.trim();
  if (!trimmed) return "other";
  for (const { intent, patterns } of KEYWORD_RULES) {
    if (patterns.some((pattern) => pattern.test(trimmed))) return intent;
  }
  return "other";
}
