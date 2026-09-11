-- CRM-01.6: "Send retries do not create duplicate outbound records." crm.interaction's
-- existing unique index (20260911000000_crm_backlog_schema_baseline.sql) dedupes on
-- (business_id, channel, external_message_id) -- perfect for inbound webhook replay,
-- since the provider's own message id is already known. It's no help for an *outbound*
-- send: the provider doesn't hand back a message id until the send succeeds, so a
-- retried send attempt (network timeout, function retry) has nothing to dedupe against
-- yet. client_dedupe_key is a caller-supplied key (e.g. a UUID generated once per logical
-- send attempt, reused across retries of that same attempt) filling that gap.
alter table crm.interaction add column client_dedupe_key text;

create unique index interaction_client_dedupe_key_uq
  on crm.interaction (business_id, client_dedupe_key)
  where client_dedupe_key is not null;
