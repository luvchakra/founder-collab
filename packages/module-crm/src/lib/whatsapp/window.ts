export const WHATSAPP_SESSION_WINDOW_HOURS = 24;

export type WhatsAppWindowStatus = { withinWindow: boolean; expiresAt: string | null };

/**
 * CRM-07.7's "24-Hour Window Awareness": WhatsApp's Cloud API only allows a free-form
 * ("session") message within 24 hours of the customer's most recent inbound message --
 * outside that window, only a pre-approved template message can be sent (CRM-07.8).
 * Pure so it's unit-testable against a fixed clock rather than the real `Date.now()`,
 * same split this codebase already uses for e.g. `conversations/queue.ts#computeConversationFlags()`.
 * No inbound message at all (`lastInboundAt === null`) is treated as outside the window --
 * there's nothing to have opened a session in the first place.
 */
export function computeWhatsAppWindowStatus(lastInboundAt: string | null, now: Date): WhatsAppWindowStatus {
  if (!lastInboundAt) return { withinWindow: false, expiresAt: null };
  const expiresAt = new Date(new Date(lastInboundAt).getTime() + WHATSAPP_SESSION_WINDOW_HOURS * 60 * 60 * 1000);
  return { withinWindow: now.getTime() < expiresAt.getTime(), expiresAt: expiresAt.toISOString() };
}
