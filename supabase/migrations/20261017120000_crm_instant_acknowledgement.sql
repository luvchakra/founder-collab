-- CRM-INSTANT-ACK-01 — "Instant acknowledgment, then human" actually does something.
--
-- Until now the instant-reply setting on a connected account was stored and never read:
-- the inbound ingest paths deliberately dropped it. With this story, an account set to
-- 'instant_ack_then_human' sends ONE fixed, business-written acknowledgement the first
-- time a contact messages within a 24-hour period, then leaves the conversation to a
-- person. No AI is involved: the text is exactly what the business typed.
--
-- 1. crm.instant_reply_settings — the acknowledgement text, one per business. No row
--    means the default text the app shows ("Thanks for your message — we'll reply
--    shortly."); the business can change it.
-- 2. crm.channel_connection.instant_reply_mode — WhatsApp connects through
--    channel_connection (CRM-07.2), not channel_accounts, so its mode lives there.
-- 3. Sending is now real, and irreversible actions are opt-in (CLAUDE.md): every account
--    starts at 'off', and existing accounts are reset to 'off' — the old default
--    ('instant_ack_then_human') was never a choice anyone made knowing it would send.
-- 4. 'draft_approve' ("AI drafts, human approves") is no longer offered: nothing ever
--    drafted on ingest. Drafting is "Draft with AI" in Conversations. The enum value stays
--    (dropping an enum value means rebuilding the type); a check keeps it unused.

create table crm.instant_reply_settings (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  ack_text text not null check (length(btrim(ack_text)) between 1 and 500),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger instant_reply_settings_set_updated_at before update on crm.instant_reply_settings
  for each row execute function core.set_updated_at();

alter table crm.instant_reply_settings enable row level security;

create policy "members can view instant_reply_settings in their licensed businesses"
  on crm.instant_reply_settings for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );
create policy "channel managers can create instant_reply_settings in their licensed businesses"
  on crm.instant_reply_settings for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  );
create policy "channel managers can update instant_reply_settings in their licensed businesses"
  on crm.instant_reply_settings for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  );

revoke all on crm.instant_reply_settings from anon, authenticated;
grant select, insert, update on crm.instant_reply_settings to authenticated;
-- The webhook ingest reads the text with the service-role client (no session).
grant select on crm.instant_reply_settings to service_role;

alter table crm.channel_connection
  add column instant_reply_mode crm.instant_reply_mode not null default 'off',
  add constraint channel_connection_instant_reply_mode_offered check (instant_reply_mode <> 'draft_approve');

update crm.channel_accounts set instant_reply_mode = 'off' where instant_reply_mode <> 'off';
alter table crm.channel_accounts
  alter column instant_reply_mode set default 'off',
  add constraint channel_accounts_instant_reply_mode_offered check (instant_reply_mode <> 'draft_approve');

-- The "once per contact per 24 hours" lookup the ingest runs before every acknowledgement.
create index interaction_auto_ack_lookup_idx
  on crm.interaction (business_id, channel, external_actor_id, occurred_at desc)
  where interaction_type = 'automatic_acknowledgement';
