/**
 * CRM-01.4: the CRM module's domain event vocabulary (00-MASTER-PLAN.md §6 mechanism 3
 * / ADR-5) -- the complete, closed list of event types module-crm may publish to
 * `core.domain_events`. `CrmEventType` is the single source of truth other CRM code
 * imports rather than hand-typing event-name string literals (the pattern every other
 * module currently uses at each `publish()` call site, e.g.
 * lib/tickets/mutations.ts's own inline `"ticket.resolved"` -- CRM-01.4 is explicitly
 * the story that centralizes and documents this instead).
 *
 * Only events with a real producer wired up today are actually published (see
 * events/publish.ts's own callers) -- the remaining vocabulary entries are declared
 * here (so their name and payload shape are locked in) but not yet emitted, since no
 * mutation exists yet to emit them from (crm.opportunity.stage_changed/won/lost need
 * CRM-04.2's pipeline, crm.follow_up.* need a follow_up mutation CRM-05.x builds,
 * crm.channel.connected needs CRM-07.2's connection flow, crm.review.received needs
 * CRM-08.5's review ingestion). Declaring the name now against the schema this story
 * already created, without a caller yet, is not the same as pre-building the feature
 * that will eventually call it.
 *
 * Versioning: every payload carries an explicit `v` literal so a future breaking change
 * to one event's shape adds a new `...PayloadV2` variant and a new `v: 2` consumer case
 * rather than silently changing what old parked/replayed events already on the queue
 * mean.
 */
export type CrmEventType =
  | "crm.lead.created"
  | "crm.lead.updated"
  | "crm.lead.converted"
  | "crm.opportunity.created"
  | "crm.opportunity.stage_changed"
  | "crm.opportunity.won"
  | "crm.opportunity.lost"
  | "crm.interaction.received"
  | "crm.interaction.responded"
  | "crm.follow_up.created"
  | "crm.follow_up.completed"
  | "crm.conversation.updated"
  | "crm.channel.connected"
  | "crm.review.received";

export type CrmLeadCreatedPayloadV1 = { v: 1; leadId: string; partyId: string; source: string };
export type CrmLeadUpdatedPayloadV1 = { v: 1; leadId: string; changedFields: string[] };
export type CrmLeadConvertedPayloadV1 = { v: 1; leadId: string; opportunityId: string };

export type CrmOpportunityCreatedPayloadV1 = { v: 1; opportunityId: string; partyId: string; leadId: string | null };
export type CrmOpportunityStageChangedPayloadV1 = { v: 1; opportunityId: string; fromStageId: string | null; toStageId: string | null };
export type CrmOpportunityWonPayloadV1 = { v: 1; opportunityId: string };
export type CrmOpportunityLostPayloadV1 = { v: 1; opportunityId: string; reason: string | null };

export type CrmInteractionReceivedPayloadV1 = { v: 1; interactionId: string; conversationId: string; channel: string; requiresResponse: boolean };
export type CrmInteractionRespondedPayloadV1 = { v: 1; interactionId: string; conversationId: string };

export type CrmFollowUpCreatedPayloadV1 = { v: 1; followUpId: string; dueAt: string; ownerId: string | null };
export type CrmFollowUpCompletedPayloadV1 = { v: 1; followUpId: string };

export type CrmConversationUpdatedPayloadV1 = { v: 1; conversationId: string; status: string };
export type CrmChannelConnectedPayloadV1 = { v: 1; channelConnectionId: string; channel: string; provider: string };
export type CrmReviewReceivedPayloadV1 = { v: 1; reviewItemId: string; provider: string; rating: number | null };

/** Maps each event type to its (current-version) payload shape -- `publishCrmEvent()`
 * uses this to type-check the payload against the event name at the call site. */
export type CrmEventPayloads = {
  "crm.lead.created": CrmLeadCreatedPayloadV1;
  "crm.lead.updated": CrmLeadUpdatedPayloadV1;
  "crm.lead.converted": CrmLeadConvertedPayloadV1;
  "crm.opportunity.created": CrmOpportunityCreatedPayloadV1;
  "crm.opportunity.stage_changed": CrmOpportunityStageChangedPayloadV1;
  "crm.opportunity.won": CrmOpportunityWonPayloadV1;
  "crm.opportunity.lost": CrmOpportunityLostPayloadV1;
  "crm.interaction.received": CrmInteractionReceivedPayloadV1;
  "crm.interaction.responded": CrmInteractionRespondedPayloadV1;
  "crm.follow_up.created": CrmFollowUpCreatedPayloadV1;
  "crm.follow_up.completed": CrmFollowUpCompletedPayloadV1;
  "crm.conversation.updated": CrmConversationUpdatedPayloadV1;
  "crm.channel.connected": CrmChannelConnectedPayloadV1;
  "crm.review.received": CrmReviewReceivedPayloadV1;
};
