import type { ChannelType } from "../conversations/types";

export type InteractionDirection = "inbound" | "outbound";
export type InteractionStatus = "received" | "processing" | "responded" | "failed" | "ignored";

/** crm.interaction row shape -- CRM-01.5's provider-neutral interaction model, fields
 * exactly as the backlog specifies. */
export type Interaction = {
  id: string;
  business_id: string;
  conversation_id: string;
  party_id: string | null;
  channel: ChannelType;
  external_actor_id: string | null;
  external_message_id: string | null;
  direction: InteractionDirection;
  interaction_type: string;
  occurred_at: string;
  content_reference: string | null;
  content_excerpt: string | null;
  media_reference: string | null;
  status: InteractionStatus;
  requires_response: boolean;
  response_due_at: string | null;
  responded_at: string | null;
  intent: string | null;
  intent_confidence: number | null;
  sentiment: string | null;
  source_module: string | null;
  source_reference: string | null;
  metadata: Record<string, unknown>;
  /** CRM-01.6: caller-supplied idempotency key for an outbound send attempt -- see
   * lib/interactions/mutations.ts's own doc comment on `recordInteraction()` for why
   * `external_message_id` alone can't dedupe a retried send (the provider hasn't
   * assigned one yet). Null for inbound interactions and any outbound one recorded
   * without retry protection. */
  client_dedupe_key: string | null;
  created_at: string;
  updated_at: string;
};

/** Input for `recordInteraction()`. Either `conversationId` (append to a known
 * conversation) or `partyId` + `channel` (find-or-create one) must be given -- full
 * sender-matching hierarchy (phone/email/external-id fallback to manual match) is
 * CRM-06.4's own story; this does the simple case only. */
export type RecordInteractionInput = {
  conversationId?: string;
  partyId?: string | null;
  channel: ChannelType;
  externalActorId?: string | null;
  externalMessageId?: string | null;
  direction: InteractionDirection;
  interactionType?: string;
  occurredAt?: string;
  contentReference?: string | null;
  contentExcerpt?: string | null;
  mediaReference?: string | null;
  requiresResponse?: boolean;
  sourceModule?: string | null;
  sourceReference?: string | null;
  metadata?: Record<string, unknown>;
  /** CRM-01.6: pass a stable key (generated once per logical send attempt, reused
   * across retries of that same attempt) for an outbound interaction so a retried send
   * updates the same row instead of creating a second one. Not needed for inbound
   * interactions, which dedupe on `externalMessageId` instead. */
  clientDedupeKey?: string | null;
};
