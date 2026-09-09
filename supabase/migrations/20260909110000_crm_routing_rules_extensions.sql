-- docs/design/crm-module-design.md Part B, B3: routing rules matched on channel +
-- priority only until now. Two of the three extensions this adds are evaluated for
-- real (lib/routing-rules/evaluate.ts): known-vs-new sender (an inbound message from a
-- party with prior fsm/inventory activity routes differently than a stranger) and
-- business hours (outside a rule's own configured window, it simply doesn't match).
--
-- The third -- "by AI-detected intent/sentiment" -- only has a column here
-- (detected_intent), not an evaluator: populating it needs an AI classification call
-- module-crm can't make yet (the same missing cross-module AI-routing primitive noted
-- in ingest-inbound-message.ts's own instant-reply comment -- BYOK credentials are
-- discovery-schema-owned with no contract exposing them). A real follow-up, not
-- silently skipped: the column exists so a future migration doesn't need to revisit
-- this table's shape, and evaluate.ts's own doc comment says so explicitly.

create type crm.known_sender_condition as enum ('any', 'known', 'new');

alter table crm.routing_rules add column condition_known_sender crm.known_sender_condition not null default 'any';
alter table crm.routing_rules add column business_hours_start time;
alter table crm.routing_rules add column business_hours_end time;
alter table crm.routing_rules add constraint routing_rules_business_hours_both_or_neither
  check ((business_hours_start is null) = (business_hours_end is null));

-- Schema-only for now -- see header comment. Left off crm.tickets/messages entirely
-- (rather than half-populating it) so no reader mistakes an always-null column for a
-- real signal.
alter table crm.routing_rules add column detected_intent_filter text[];
