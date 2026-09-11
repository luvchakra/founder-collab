import type { ChannelType } from "../conversations/types";
import type { InteractionDirection } from "./types";

/**
 * CRM-09.1's "requires_response Rules Engine" -- the backlog's exact rule list ("An
 * interaction is response-required when: direction = inbound; channel is supported;
 * content is not obvious spam/system noise; no qualifying business response exists"),
 * evaluated deterministically before any AI enrichment (CRM-09.3's intent classifier is
 * a later, additive refinement -- this function is the floor it builds on, not something
 * it replaces).
 *
 * Only channels with a real outbound send path today count as "supported" -- flagging an
 * interaction as needing a reply the business has no way to send yet would be a false
 * promise. Extend this list as each channel's own send story lands (CRM-08.x social,
 * CRM-16.x email/SMS).
 */
const SUPPORTED_RESPONSE_CHANNELS: ChannelType[] = ["whatsapp"];

/**
 * Deliberately simple, deterministic pattern matching -- CLAUDE.md's "do not use an LLM
 * for deterministic operations." Empty/whitespace-only content is treated as noise too
 * (nothing there to respond to). This is intentionally conservative: CRM-09.3's real
 * intent classifier is where nuanced spam detection belongs; this floor only catches the
 * obvious cases the backlog names.
 */
const NOISE_PATTERNS = [/^unsubscribe$/i, /out[- ]of[- ]office/i, /automatic reply/i, /no-?reply/i, /delivery status notification/i];

export function isObviousNoise(contentExcerpt: string | null | undefined): boolean {
  if (!contentExcerpt || !contentExcerpt.trim()) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(contentExcerpt));
}

export type ResponseRuleInput = {
  direction: InteractionDirection;
  channel: ChannelType;
  contentExcerpt?: string | null;
};

/**
 * The fourth backlog rule ("no qualifying business response exists") is not this
 * function's job to check -- at the moment a fresh inbound interaction is being
 * recorded, no response to it can exist yet by definition. It matters only *later*,
 * when a business reply arrives: `recordInteraction()`'s own outbound path clears
 * `requires_response` on the interactions it responds to (see its doc comment), rather
 * than this function re-deriving it from scratch each time.
 */
export function evaluateRequiresResponse(input: ResponseRuleInput): boolean {
  if (input.direction !== "inbound") return false;
  if (!SUPPORTED_RESPONSE_CHANNELS.includes(input.channel)) return false;
  if (isObviousNoise(input.contentExcerpt)) return false;
  return true;
}
