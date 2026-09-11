/**
 * CRM-07.10's attribution mechanism, kept as pure functions with zero server imports --
 * Meta's `wa.me` click-to-chat links carry no structured metadata of their own, only a
 * pre-filled message string, so attribution rides along as a short `[ref:CODE]` tag
 * appended to that text and parsed back out of the first inbound message on the
 * CRM-07.3 ingest path (see ingest-inbound-message.ts).
 */
const REF_TAG_PATTERN = /\s*\[ref:([A-Za-z0-9]{4,12})\]\s*$/;

export function generateRefCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function buildPrefilledMessageWithRef(message: string, refCode: string): string {
  return `${message.trim()} [ref:${refCode}]`;
}

export function extractClickToChatRef(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(REF_TAG_PATTERN);
  return match?.[1] ?? null;
}

/** Strips the `[ref:CODE]` tag back out before the message is stored as an interaction's
 * `contentExcerpt` -- a customer's own inbound message shouldn't show the attribution
 * plumbing in the conversation transcript a human reads. */
export function stripClickToChatRef(text: string): string {
  return text.replace(REF_TAG_PATTERN, "").trim();
}

export function buildWaMeLink(whatsappNumber: string, prefilledMessage: string): string {
  const digitsOnly = whatsappNumber.replace(/[^0-9]/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(prefilledMessage)}`;
}
