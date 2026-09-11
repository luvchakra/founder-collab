import type { Conversation, ConversationStatus } from "./types";

/** A "high intent" threshold over `crm.interaction.intent_confidence` -- no classifier
 * populates that column yet (CRM-09.3/09.6's own job, per the audit doc's retirement
 * table), so this filter honestly returns nothing until then rather than fabricating a
 * signal. 0.7 is a plain, documented default, not a tuned model threshold. */
const HIGH_INTENT_THRESHOLD = 0.7;

export type ConversationInteractionSummary = {
  requiresResponse: boolean;
  respondedAt: string | null;
  responseDueAt: string | null;
  intentConfidence: number | null;
};

export type ConversationQueueRow = Conversation & {
  partyName: string | null;
  needsResponse: boolean;
  overdue: boolean;
  highIntent: boolean;
};

/**
 * CRM-06.2: derives the three interaction-driven flags a conversation queue needs from
 * that conversation's own interactions, rather than storing them redundantly on
 * `crm.conversation` itself (they'd drift the moment a reply landed or a response_due_at
 * passed). Pure and unit-tested with a fixed clock so "overdue" doesn't depend on
 * wall-clock time in tests.
 *
 * - needsResponse: any interaction still requires a response (requires_response=true,
 *   responded_at still null) -- crm.interaction's own existing fields, not a new signal.
 * - overdue: one of those unresponded interactions already has a response_due_at in the
 *   past. CRM-05.5 (SLA Timer, P1) is what will actually start populating
 *   response_due_at business-configurably; until then this filter is real but empty.
 * - highIntent: any interaction's intent_confidence clears HIGH_INTENT_THRESHOLD --
 *   likewise real but empty until CRM-09.x's classifier starts writing intent_confidence.
 */
export function computeConversationFlags(
  interactions: ConversationInteractionSummary[],
  now: Date,
): { needsResponse: boolean; overdue: boolean; highIntent: boolean } {
  const unresponded = interactions.filter((i) => i.requiresResponse && !i.respondedAt);
  return {
    needsResponse: unresponded.length > 0,
    overdue: unresponded.some((i) => i.responseDueAt !== null && new Date(i.responseDueAt).getTime() < now.getTime()),
    highIntent: interactions.some((i) => i.intentConfidence !== null && i.intentConfidence >= HIGH_INTENT_THRESHOLD),
  };
}

export type ConversationQueueFilters = {
  needsResponse?: boolean;
  assignedToMe?: boolean;
  overdue?: boolean;
  highIntent?: boolean;
  channel?: string;
  status?: ConversationStatus;
  ownerId?: string;
};

/** CRM-06.2's exact filter list ("needs response, assigned to me, overdue, high intent,
 * channel, status, owner"), all AND-combined over one already-fetched queue -- same
 * one-function-not-N-queries shape as follow-ups/queue.ts's applyFollowUpQueueFilters(). */
export function applyConversationQueueFilters(rows: ConversationQueueRow[], filters: ConversationQueueFilters, myEmployeeId: string | null): ConversationQueueRow[] {
  let result = rows;
  if (filters.needsResponse) result = result.filter((r) => r.needsResponse);
  if (filters.assignedToMe) result = result.filter((r) => myEmployeeId !== null && r.assigned_to === myEmployeeId);
  if (filters.overdue) result = result.filter((r) => r.overdue);
  if (filters.highIntent) result = result.filter((r) => r.highIntent);
  if (filters.channel) result = result.filter((r) => r.primary_channel === filters.channel);
  if (filters.status) result = result.filter((r) => r.status === filters.status);
  if (filters.ownerId) result = result.filter((r) => (filters.ownerId === "unassigned" ? !r.assigned_to : r.assigned_to === filters.ownerId));
  return result;
}
