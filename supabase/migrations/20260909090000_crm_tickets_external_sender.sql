-- docs/design/crm-module-design.md Part A, A2: inbound webhooks need to recognize "is
-- this the same external conversation as an already-open ticket" independently of
-- whether a core.parties match was found -- a brand-new sender with no party yet
-- (until "Convert to prospect" or an inventory/fsm order links one) still needs its
-- second, third, ... message to land on the same ticket rather than opening a new one
-- every time. `external_sender_handle` is the provider-side identifier (a WhatsApp
-- phone number, an Instagram/Facebook/Google Business Messages user id) that makes
-- that lookup possible; nullable because manually created tickets (createTicket(),
-- S-1's existing skeleton) have no external sender at all.

alter table crm.tickets add column external_sender_handle text;

create index tickets_external_sender_idx on crm.tickets (business_id, channel_id, external_sender_handle)
  where external_sender_handle is not null;
