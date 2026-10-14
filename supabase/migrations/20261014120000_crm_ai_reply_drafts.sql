-- PLATFORM-P1-12.1 / 12.2 / 12.4 (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §42; design and
-- owner decisions in docs/design/crm-whatsapp-ai-replies.md). Phase 1: AI-drafted WhatsApp
-- replies that a person sends. Nothing here sends anything.

-- ---------------------------------------------------------------------------------------
-- Contact details a reply may quote (12.2). core.businesses had none: no phone, email,
-- address or opening hours anywhere, so "what are your hours?" had no real answer to give.
-- Free text, entered by the business on its Business page; empty means "not recorded" and the
-- AI is told so rather than guessing.
-- ---------------------------------------------------------------------------------------
alter table core.businesses
  add column contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  add column contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column address text check (address is null or length(address) <= 500),
  add column opening_hours text check (opening_hours is null or length(opening_hours) <= 500);

-- ---------------------------------------------------------------------------------------
-- One AI draft per inbound message (12.1 / 12.4): what it answered, from which facts, cached
-- by input hash so reopening the conversation never pays for a second identical call.
-- ---------------------------------------------------------------------------------------
create table crm.reply_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  interaction_id uuid not null references crm.interaction (id) on delete cascade,
  -- 'answered': a draft a person may send. 'not_answerable': the model couldn't answer from the
  -- facts, or the topic needs a person -- the panel says so and offers nothing to send.
  status text not null check (status in ('answered', 'not_answerable')),
  answer text check ((status = 'answered') = (answer is not null) and (answer is null or length(answer) between 1 and 1000)),
  topic text not null check (topic in ('hours_location_contact', 'products_prices', 'product_info', 'order_job_status', 'needs_person', 'other')),
  -- [{ "id": "...", "label": "..." }] -- the facts the answer used, shown to the team.
  facts_used jsonb not null default '[]'::jsonb check (jsonb_typeof(facts_used) = 'array'),
  input_hash text not null,
  prompt_version text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (interaction_id)
);

create index reply_drafts_business_id_idx on crm.reply_drafts (business_id);

-- The interaction must belong to the same business (a client can't attach a draft to another
-- tenant's message even with a forged business_id).
create function crm.enforce_reply_draft_refs() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from crm.interaction i where i.id = new.interaction_id and i.business_id = new.business_id) then
    raise exception 'Interaction not found in this business.' using errcode = '23503';
  end if;
  return new;
end; $$;
create trigger reply_drafts_enforce_refs before insert or update on crm.reply_drafts
  for each row execute function crm.enforce_reply_draft_refs();
revoke execute on function crm.enforce_reply_draft_refs() from public, anon, authenticated;

-- tenant AND licensed (ADR-4, ADR-8), same shape as every other crm.* table.
alter table crm.reply_drafts enable row level security;

create policy "members can view reply_drafts in their licensed businesses"
  on crm.reply_drafts for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );
create policy "members can create reply_drafts in their licensed businesses"
  on crm.reply_drafts for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can update reply_drafts in their licensed businesses"
  on crm.reply_drafts for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

revoke all on crm.reply_drafts from anon;
grant select, insert, update on crm.reply_drafts to authenticated;
grant all on crm.reply_drafts to service_role;
