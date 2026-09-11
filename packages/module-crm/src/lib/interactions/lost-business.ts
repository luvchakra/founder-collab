import type { ChannelType } from "../conversations/types";

/**
 * CRM-09.2's "Potential Lost Business Queue" -- the backlog's exact show-list is age,
 * person/company, channel, message excerpt, intent, related product, opportunity value
 * if known, owner, SLA status. `intent` and `related product` are real columns
 * (`crm.interaction.intent`, `crm.product_interest`) but nothing writes to either yet --
 * CRM-09.3 (Message Intent Classification) and CRM-10.1 (Product Interest Association)
 * are separate, not-yet-built stories, so those two fields stay honestly null here
 * rather than being faked, same "real but empty until its own story lands" discipline
 * `conversations/queue.ts` already established for `highIntent`/`overdue`.
 */
export type PotentialLostBusinessRow = {
  interactionId: string;
  conversationId: string;
  partyId: string | null;
  channel: ChannelType;
  contentExcerpt: string | null;
  occurredAt: string;
  intent: string | null;
  opportunityId: string | null;
  responseDueAt: string | null;
};

export type PotentialLostBusinessQueueRow = PotentialLostBusinessRow & { ageMs: number; overdue: boolean };

/**
 * "SLA status" (overdue vs. not) reuses `response_due_at`, same field
 * `conversations/queue.ts#computeConversationFlags()` already reads -- nothing populates
 * it yet either (CRM-05.5 SLA Timer, P1), so `overdue` is real but always `false` until
 * that story starts writing business-configured due dates. `age` is always real: it's
 * just how long ago the message arrived.
 */
export function toPotentialLostBusinessQueueRow(row: PotentialLostBusinessRow, now: Date): PotentialLostBusinessQueueRow {
  return {
    ...row,
    ageMs: now.getTime() - new Date(row.occurredAt).getTime(),
    overdue: row.responseDueAt !== null && new Date(row.responseDueAt).getTime() < now.getTime(),
  };
}

/** Compact "how long ago" display for the queue's `age` column -- minutes under an hour,
 * hours under a day, whole days beyond that. Negative/zero ages (clock skew, a message
 * timestamped in the future) collapse to "just now" rather than a nonsensical "-5m". */
export function formatAge(ageMs: number): string {
  if (ageMs <= 0) return "just now";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
