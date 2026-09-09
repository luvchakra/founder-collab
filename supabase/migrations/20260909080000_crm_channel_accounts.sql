-- docs/design/crm-module-design.md Part A, A1: "crm.channels today is just a label.
-- Add crm.channel_accounts: one row per actually-connected external account." Tokens
-- encrypted the same way BYOK's ai_provider_credentials.encrypted_api_key already is
-- (core.crypto/api-key.ts's AES-256-GCM helpers, keyed by the same platform-wide
-- API_KEY_ENCRYPTION_SECRET -- see that file's own comment on why it's generic, not
-- BYOK-specific, despite the function names).
--
-- instant_reply_mode lives here (not on crm.channels) because instant-reply behavior
-- is a property of *this specific connected account*, not the channel kind in the
-- abstract -- two WhatsApp Business accounts on the same business could reasonably
-- want different modes. A3's own default for a newly connected account is
-- 'instant_ack_then_human' (design doc P0 item 2: "the mode that actually solves
-- 'messages go unanswered'... as the default for new channel connections").

create type crm.channel_provider as enum (
  'whatsapp_business', 'instagram', 'facebook_messenger', 'google_business_messages'
);
create type crm.channel_account_status as enum ('connected', 'expired', 'revoked');
create type crm.instant_reply_mode as enum ('off', 'draft_approve', 'instant_ack_then_human');

create table crm.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  channel_id uuid not null references crm.channels (id) on delete cascade,
  provider crm.channel_provider not null,
  external_account_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  status crm.channel_account_status not null default 'connected',
  instant_reply_mode crm.instant_reply_mode not null default 'instant_ack_then_human',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_account_id)
);

create index channel_accounts_business_id_idx on crm.channel_accounts (business_id);
create index channel_accounts_channel_id_idx on crm.channel_accounts (channel_id);

create trigger channel_accounts_set_updated_at before update on crm.channel_accounts
  for each row execute function core.set_updated_at();

-- Same cross-tenant reference guard every other crm.*.channel_id column already has
-- (crm.enforce_channel_business_id, defined in 20260908130000_crm_schema.sql) -- a
-- dedicated function rather than reusing enforce_tickets_refs(), since this table has
-- neither party_id nor assigned_to for that function to (harmlessly) skip.
create function crm.enforce_channel_accounts_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_channel_business_id(new.channel_id, new.business_id);
  return new;
end; $$;
create trigger channel_accounts_enforce_refs before insert or update on crm.channel_accounts
  for each row execute function crm.enforce_channel_accounts_refs();

-- ---------------------------------------------------------------------------
-- Row Level Security -- identical `tenant AND licensed` shape as crm.channels/tickets/
-- routing_rules (20260908130000_crm_schema.sql's own header comment).
-- ---------------------------------------------------------------------------

alter table crm.channel_accounts enable row level security;

create policy "members can view channel accounts in their licensed businesses"
  on crm.channel_accounts for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );
create policy "members can create channel accounts in their licensed businesses"
  on crm.channel_accounts for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can update channel accounts in their licensed businesses"
  on crm.channel_accounts for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can delete channel accounts in their licensed businesses"
  on crm.channel_accounts for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

grant select, insert, update, delete on crm.channel_accounts to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- core.messages.channel (20260908100000_core_messages.sql) only allowed 'email'/'sms'
-- -- extend it for the four channels A2's inbound webhooks will actually normalize
-- into this shared table.
-- ---------------------------------------------------------------------------

alter table core.messages drop constraint messages_channel_check;
alter table core.messages add constraint messages_channel_check
  check (channel in (
    'email', 'sms', 'whatsapp', 'instagram', 'facebook_messenger', 'google_business_messages'
  ));
