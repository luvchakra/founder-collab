-- PLATFORM-P1-12.5/12.6 (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §42; design and owner
-- decisions in docs/design/crm-whatsapp-ai-replies.md, phase 2). Owner-approved 2026-10-17:
-- a WhatsApp AI reply may be sent without a person when the business turns on "Send
-- automatically". Everything that decides whether it may is here or in plain code -- the
-- model only proposes the answer.
--
-- 1. crm.channel_connection.ai_reply_mode: 'draft' (default, today's behaviour) or 'auto'.
--    Only a member holding channel_connections.manage may change it (trigger below; the
--    service role, which has no auth.uid(), is the webhook and is never asked to change it).
-- 2. core.communication_suppressions gains a channel, so a WhatsApp contact who sends STOP
--    is recorded in the same canonical opt-out table as email (PRIV-1), as a one-way hash.
-- 3. crm.ai_auto_replies: one row per inbound message considered for an automatic reply,
--    claimed BEFORE anything is sent (unique per message, so a redelivered webhook or a
--    re-run drain can never send twice) and carrying the outcome afterwards. The daily and
--    per-conversation limits are counted inside crm.claim_ai_auto_reply() under a
--    per-business advisory lock, so concurrent deliveries can't both slip under a limit.

-- ---------------------------------------------------------------------------------------
-- 1. The mode
-- ---------------------------------------------------------------------------------------
alter table crm.channel_connection
  add column ai_reply_mode text not null default 'draft' check (ai_reply_mode in ('draft', 'auto'));

create function crm.enforce_ai_reply_mode_permission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.ai_reply_mode is distinct from old.ai_reply_mode
     and auth.uid() is not null
     and not core.has_permission(new.business_id, 'channel_connections.manage') then
    raise exception 'Changing how WhatsApp AI replies are sent needs the channel_connections.manage permission.' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger channel_connection_ai_reply_mode_permission before update on crm.channel_connection
  for each row execute function crm.enforce_ai_reply_mode_permission();
revoke execute on function crm.enforce_ai_reply_mode_permission() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 2. WhatsApp opt-outs, in the canonical suppression table
-- ---------------------------------------------------------------------------------------
-- email_hash keeps its name (PRIV-1's callers upsert on (business_id, email_hash)); for a
-- WhatsApp row it holds core.whatsapp_contact_hash(), which is namespaced ('whatsapp:' +
-- digits) so it can never equal an email's hash and is_email_suppressed() stays correct.
alter table core.communication_suppressions
  add column channel text not null default 'email' check (channel in ('email', 'whatsapp'));

create function core.whatsapp_contact_hash(p_phone text)
returns text
language sql
immutable
set search_path = core
as $$
  select encode(sha256(convert_to('whatsapp:' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------------------------
-- 3. Automatic replies
-- ---------------------------------------------------------------------------------------
create table crm.ai_auto_replies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  conversation_id uuid not null references crm.conversation (id) on delete cascade,
  -- the inbound customer message this reply answers -- one row per message, ever
  interaction_id uuid not null references crm.interaction (id) on delete cascade,
  -- requested: claimed, counted against the limits, not yet sent (if it stays here the
  --            send's outcome is unknown, and it is never retried automatically)
  -- sent / failed: the send's real outcome. skipped: not sent, with the reason.
  status text not null check (status in ('requested', 'sent', 'failed', 'skipped')),
  reason text check (reason is null or reason in (
    'not_licensed', 'ai_off', 'policy_check_failed', 'not_connected', 'outside_window', 'opted_out',
    'superseded', 'already_answered', 'no_text', 'daily_limit', 'conversation_limit',
    'cannot_answer', 'low_confidence', 'invalid_output', 'needs_person', 'topic_not_allowed', 'ai_error',
    'send_failed'
  )),
  check ((status = 'skipped') = (reason is not null and reason <> 'send_failed')),
  check (status <> 'failed' or reason = 'send_failed'),
  -- the business's own calendar day (core.business_settings.timezone) the limits count in
  local_day date not null,
  answer text check (answer is null or length(answer) between 1 and 1000),
  topic text,
  facts_used jsonb not null default '[]'::jsonb check (jsonb_typeof(facts_used) = 'array'),
  outbound_interaction_id uuid references crm.interaction (id) on delete set null,
  error text check (error is null or length(error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (interaction_id)
);

create index ai_auto_replies_business_day_idx on crm.ai_auto_replies (business_id, local_day);
create index ai_auto_replies_conversation_day_idx on crm.ai_auto_replies (conversation_id, local_day);
create index ai_auto_replies_outbound_interaction_id_idx on crm.ai_auto_replies (outbound_interaction_id);

-- Same-business references, and an outcome is final: requested -> sent | failed | skipped,
-- nothing else, and the message, business and day never change.
create function crm.enforce_ai_auto_reply_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from crm.interaction i
                 where i.id = new.interaction_id and i.business_id = new.business_id
                   and i.conversation_id = new.conversation_id and i.direction = 'inbound') then
    raise exception 'Inbound message not found in this business.' using errcode = '23503';
  end if;
  if new.outbound_interaction_id is not null and not exists (
       select 1 from crm.interaction i where i.id = new.outbound_interaction_id and i.business_id = new.business_id) then
    raise exception 'Outbound message not found in this business.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    if new.business_id <> old.business_id or new.interaction_id <> old.interaction_id
       or new.conversation_id <> old.conversation_id or new.local_day <> old.local_day then
      raise exception 'An automatic reply record cannot be moved.' using errcode = '42501';
    end if;
    if old.status <> 'requested' and new.status is distinct from old.status then
      raise exception 'An automatic reply''s outcome is final.' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  return new;
end; $$;
create trigger ai_auto_replies_rules before insert or update on crm.ai_auto_replies
  for each row execute function crm.enforce_ai_auto_reply_rules();
revoke execute on function crm.enforce_ai_auto_reply_rules() from public, anon, authenticated;

-- Every automatic send is in core.audit_log: when it was claimed, and how it ended.
create function crm.audit_ai_auto_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.status = 'requested')
     or (tg_op = 'UPDATE' and old.status = 'requested' and new.status <> 'requested') then
    perform core.append_audit_log(
      new.business_id, null, 'crm_ai_auto_reply.' || new.status, 'crm_ai_auto_reply', new.id,
      case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status) else null end,
      jsonb_build_object(
        'interactionId', new.interaction_id, 'conversationId', new.conversation_id,
        'outboundInteractionId', new.outbound_interaction_id, 'status', new.status,
        'reason', new.reason, 'topic', new.topic, 'factsUsed', new.facts_used
      )
    );
  end if;
  return null;
end; $$;
create trigger ai_auto_replies_audit after insert or update on crm.ai_auto_replies
  for each row execute function crm.audit_ai_auto_reply();
revoke execute on function crm.audit_ai_auto_reply() from public, anon, authenticated;

-- tenant AND licensed (ADR-4, ADR-8). Members read; nobody but the service role writes.
alter table crm.ai_auto_replies enable row level security;

create policy "members can view ai_auto_replies in their licensed businesses"
  on crm.ai_auto_replies for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );

-- No insert/update/delete policy for members, and the privileges are revoked so an attempt
-- errors instead of silently matching nothing.
revoke all on crm.ai_auto_replies from anon, authenticated;
grant select on crm.ai_auto_replies to authenticated;
grant all on crm.ai_auto_replies to service_role;

-- The one way a row is created. Idempotent per message (an existing row is returned with
-- created = false), and the limits are deterministic: at most 100 automatic replies per
-- business and 3 per conversation per business day, counting every claim not skipped or
-- failed. p_skip_reason records a message the caller already knows must not be answered.
create function crm.claim_ai_auto_reply(p_business_id uuid, p_interaction_id uuid, p_skip_reason text default null)
returns table (id uuid, status text, reason text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing crm.ai_auto_replies;
  v_conversation_id uuid;
  v_tz text;
  v_day date;
  v_reason text := p_skip_reason;
  v_row crm.ai_auto_replies;
begin
  perform pg_advisory_xact_lock(hashtextextended('crm.ai_auto_replies:' || p_business_id::text, 0));

  select * into v_existing from crm.ai_auto_replies a where a.interaction_id = p_interaction_id;
  if found then
    if v_existing.business_id <> p_business_id then
      raise exception 'Inbound message not found in this business.' using errcode = '23503';
    end if;
    return query select v_existing.id, v_existing.status, v_existing.reason, false;
    return;
  end if;

  select i.conversation_id into v_conversation_id from crm.interaction i
  where i.id = p_interaction_id and i.business_id = p_business_id and i.direction = 'inbound' and i.channel = 'whatsapp';
  if v_conversation_id is null then
    raise exception 'Inbound WhatsApp message not found in this business.' using errcode = '23503';
  end if;

  select s.timezone into v_tz from core.business_settings s where s.business_id = p_business_id;
  begin
    v_day := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  exception when others then
    v_day := (now() at time zone 'UTC')::date;
  end;

  if v_reason is null and not exists (
       select 1 from core.licenses l where l.business_id = p_business_id and l.module_key = 'crm' and l.status = 'active') then
    v_reason := 'not_licensed';
  end if;
  if v_reason is null and (
       select count(*) from crm.ai_auto_replies a
       where a.business_id = p_business_id and a.local_day = v_day and a.status in ('requested', 'sent')) >= 100 then
    v_reason := 'daily_limit';
  end if;
  if v_reason is null and (
       select count(*) from crm.ai_auto_replies a
       where a.conversation_id = v_conversation_id and a.local_day = v_day and a.status in ('requested', 'sent')) >= 3 then
    v_reason := 'conversation_limit';
  end if;

  insert into crm.ai_auto_replies (business_id, conversation_id, interaction_id, status, reason, local_day)
  values (p_business_id, v_conversation_id, p_interaction_id, case when v_reason is null then 'requested' else 'skipped' end, v_reason, v_day)
  returning * into v_row;

  return query select v_row.id, v_row.status, v_row.reason, true;
end;
$$;

revoke execute on function crm.claim_ai_auto_reply(uuid, uuid, text) from public, anon, authenticated;
grant execute on function crm.claim_ai_auto_reply(uuid, uuid, text) to service_role;
