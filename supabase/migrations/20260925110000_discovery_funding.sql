-- FND-02 — Funding tables for Discovery (spec §19–§32).
--
-- Funding is a capability inside Discovery, not a new licensable module (spec §3.1):
-- every table is gated by the existing `discovery` entitlement, on the same
-- `tenant AND licensed` RLS as the Marketing tables (CLAUDE.md non-negotiable 2). Unlike
-- Marketing, reads also require `funding.view`: a cap table, a round's terms and
-- diligence answers are not something every member of a business should see.
--
-- Deliberate reuse instead of new masters (non-negotiable 5, spec §24.2, §29.2):
--   * an investor firm IS a `core.parties` row (role 'investor'); `discovery.investors`
--     carries only fundraising attributes. Investor contacts are `core.party_contacts` —
--     there is no `investor_contacts` table.
--   * data-room files are `core.attachments`; `data_room_items` carries the meaning.
--   * no `funding_metrics` table: Finance figures are read live through its contract
--     when licensed (spec §32), so there is nothing to snapshot yet.
--
-- Grants: covered by the schema-wide default privileges on `discovery` (see
-- 20260907120000_grant_schema_privileges.sql).

-- ---------------------------------------------------------------------------
-- core: an investor is a party role, one row many roles (ADR-3)
-- ---------------------------------------------------------------------------

alter table core.party_roles drop constraint party_roles_role_check;
alter table core.party_roles add constraint party_roles_role_check
  check (role in ('prospect', 'customer', 'supplier', 'vendor', 'lead', 'investor'));

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('funding.view', 'discovery', 'View funding profile, rounds, investors, data room and diligence'),
  ('funding.manage', 'discovery', 'Manage funding profile, rounds, investors, outreach drafts, data room and diligence'),
  ('funding.approve', 'discovery', 'Approve and send investor outreach, share data-room documents, accept diligence answers')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key)
select r, p.key
from core.permissions p, unnest(array['owner', 'admin']) as r
where p.key in ('funding.view', 'funding.manage', 'funding.approve')
on conflict (role, permission_key) do nothing;

-- The accountant prepares the financial half of a data room and answers financial
-- diligence, so can see and work on Funding, but not send or share on the business's
-- behalf.
insert into core.role_permissions (role, permission_key) values
  ('accountant', 'funding.view'),
  ('accountant', 'funding.manage')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Funding profile (§21) — one per business
-- ---------------------------------------------------------------------------

create table discovery.funding_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references core.businesses (id) on delete cascade,
  -- Narrative sections the founder writes. Authoritative facts (company name, offerings,
  -- ICP, Finance figures) are read from their owners at render time, never copied here.
  company jsonb not null default '{}'::jsonb,
  product jsonb not null default '{}'::jsonb,
  market jsonb not null default '{}'::jsonb,
  -- [{ metric, value, period, source, provenance }] — every traction figure names where
  -- it came from (§21.1 "every metric must identify its source").
  traction jsonb not null default '[]'::jsonb,
  business_model jsonb not null default '{}'::jsonb,
  objective jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(traction) = 'array')
);

-- ---------------------------------------------------------------------------
-- Rounds (§23)
-- ---------------------------------------------------------------------------

create table discovery.funding_rounds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  round_type text not null check (round_type in (
    'pre_seed', 'seed', 'series_a', 'series_b', 'bridge', 'debt', 'safe', 'convertible_note', 'other'
  )),
  status text not null default 'planning' check (status in ('planning', 'open', 'paused', 'closed', 'cancelled')),
  is_primary boolean not null default true,
  target_amount numeric(18, 2) check (target_amount >= 0),
  minimum_amount numeric(18, 2) check (minimum_amount >= 0),
  maximum_amount numeric(18, 2) check (maximum_amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  -- User-entered or source-imported only; the product gives no legal advice (§23.2).
  instrument text,
  pre_money_valuation numeric(18, 2) check (pre_money_valuation >= 0),
  post_money_valuation numeric(18, 2) check (post_money_valuation >= 0),
  target_close_date date,
  actual_close_date date,
  opened_at timestamptz,
  use_of_funds text,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    currency is not null
    or coalesce(target_amount, minimum_amount, maximum_amount, pre_money_valuation, post_money_valuation) is null
  ),
  check (minimum_amount is null or maximum_amount is null or minimum_amount <= maximum_amount)
);

create index funding_rounds_business_id_idx on discovery.funding_rounds (business_id);
-- One live primary round per business (§23.2); parallel rounds are marked non-primary.
create unique index funding_rounds_one_primary_idx
  on discovery.funding_rounds (business_id)
  where is_primary and status in ('planning', 'open', 'paused');

-- ---------------------------------------------------------------------------
-- Investors (§24) and research (§26)
-- ---------------------------------------------------------------------------

create table discovery.investors (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete restrict,
  investor_type text not null check (investor_type in (
    'vc', 'angel', 'family_office', 'corporate_vc', 'accelerator', 'pe', 'debt', 'strategic', 'other'
  )),
  website text,
  geographies text[] not null default '{}',
  stages text[] not null default '{}',
  sectors text[] not null default '{}',
  check_min numeric(18, 2) check (check_min >= 0),
  check_max numeric(18, 2) check (check_max >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  -- How this investor came to the founder's attention (§31.1 "do not invent sources").
  source text not null default 'other' check (source in (
    'founder_network', 'referral', 'inbound', 'event', 'outbound', 'accelerator', 'database', 'other'
  )),
  source_note text,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  research_status text not null default 'not_researched' check (research_status in (
    'not_researched', 'researching', 'researched'
  )),
  last_researched_at timestamptz,
  owner_id uuid,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, party_id),
  check (currency is not null or (check_min is null and check_max is null)),
  check (check_min is null or check_max is null or check_min <= check_max)
);

create index investors_business_id_idx on discovery.investors (business_id);
create index investors_business_status_idx on discovery.investors (business_id, status);

-- One finding per row, each with its provenance (§26.1): the UI must be able to tell a
-- sourced fact from something the founder typed or an AI inferred. "Stale" is computed
-- from observed_at against a freshness threshold, not stored.
create table discovery.investor_research (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  investor_id uuid not null references discovery.investors (id) on delete cascade,
  field text not null check (field in (
    'thesis', 'stage_preference', 'sector_preference', 'geography_preference', 'check_range',
    'portfolio', 'notable_investments', 'recent_investments', 'partners', 'introduction_path',
    'founder_fit', 'conflicts', 'fit_rationale', 'other'
  )),
  content text not null check (length(trim(content)) > 0),
  provenance text not null check (provenance in ('source_backed', 'user_entered', 'ai_inferred')),
  source_url text,
  source_title text,
  observed_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provenance <> 'source_backed' or source_url is not null)
);

create index investor_research_business_id_idx on discovery.investor_research (business_id);
create index investor_research_investor_id_idx on discovery.investor_research (investor_id);

-- ---------------------------------------------------------------------------
-- Pipeline (§25): one record per investor per round, with append-only stage history
-- ---------------------------------------------------------------------------

create table discovery.investor_pipeline (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  investor_id uuid not null references discovery.investors (id) on delete cascade,
  round_id uuid not null references discovery.funding_rounds (id) on delete cascade,
  stage text not null default 'identified' check (stage in (
    'identified', 'researched', 'target', 'contacted', 'meeting', 'partner_review',
    'due_diligence', 'term_discussion', 'committed', 'invested', 'passed'
  )),
  previous_stage text,
  stage_entered_at timestamptz not null default now(),
  primary_contact_id uuid references core.party_contacts (id) on delete set null,
  owner_id uuid,
  next_action text,
  next_action_due date,
  fit_summary text,
  notes text,
  -- A commitment is not money in the bank (§20.3, §23.2): the two are separate figures,
  -- and neither is ever derived from the other.
  committed_amount numeric(18, 2) check (committed_amount >= 0),
  invested_amount numeric(18, 2) check (invested_amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  pass_reason text,
  last_interaction_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, investor_id),
  check (currency is not null or (committed_amount is null and invested_amount is null))
);

create index investor_pipeline_business_id_idx on discovery.investor_pipeline (business_id);
create index investor_pipeline_round_stage_idx on discovery.investor_pipeline (round_id, stage);
create index investor_pipeline_investor_id_idx on discovery.investor_pipeline (investor_id);

create table discovery.investor_stage_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  pipeline_id uuid not null references discovery.investor_pipeline (id) on delete cascade,
  investor_id uuid not null,
  round_id uuid not null,
  from_stage text,
  to_stage text not null,
  note text,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);

create index investor_stage_history_business_id_idx on discovery.investor_stage_history (business_id);
create index investor_stage_history_pipeline_id_idx on discovery.investor_stage_history (pipeline_id, changed_at);

-- ---------------------------------------------------------------------------
-- Interactions (§28) and outreach drafts (§27)
-- ---------------------------------------------------------------------------

create table discovery.investor_interactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  investor_id uuid not null references discovery.investors (id) on delete cascade,
  contact_id uuid references core.party_contacts (id) on delete set null,
  round_id uuid references discovery.funding_rounds (id) on delete set null,
  interaction_type text not null check (interaction_type in (
    'email', 'call', 'meeting', 'demo', 'partner_review', 'follow_up', 'note', 'other'
  )),
  occurred_at timestamptz not null default now(),
  subject text,
  notes text,
  outcome text,
  next_action text,
  next_action_due date,
  source text not null default 'manual' check (source in ('manual', 'outreach', 'import')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index investor_interactions_business_id_idx on discovery.investor_interactions (business_id, occurred_at desc);
create index investor_interactions_investor_id_idx on discovery.investor_interactions (investor_id);

create table discovery.investor_outreach (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  investor_id uuid not null references discovery.investors (id) on delete cascade,
  contact_id uuid references core.party_contacts (id) on delete set null,
  round_id uuid references discovery.funding_rounds (id) on delete set null,
  subject text not null check (length(trim(subject)) > 0),
  body text not null check (length(trim(body)) > 0),
  personalization_notes text,
  source_evidence jsonb not null default '[]'::jsonb,
  cta text,
  -- 'sending' is the claim a send takes before calling the provider, so two clicks on
  -- Send cannot both deliver the same approved draft.
  status text not null default 'draft' check (status in (
    'draft', 'awaiting_approval', 'approved', 'sending', 'sent', 'failed', 'replied', 'closed'
  )),
  origin text not null default 'user' check (origin in ('user', 'ai_draft')),
  approved_by uuid,
  approved_at timestamptz,
  -- Filled only from the provider's own response (§27.4: never report success first).
  recipient_email text,
  sent_by uuid,
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  failure_reason text,
  replied_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'sent' or (provider_message_id is not null and sent_at is not null and approved_at is not null))
);

create index investor_outreach_business_id_idx on discovery.investor_outreach (business_id, status);
create index investor_outreach_investor_id_idx on discovery.investor_outreach (investor_id);

-- ---------------------------------------------------------------------------
-- Readiness (§22)
-- ---------------------------------------------------------------------------

create table discovery.funding_readiness_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  category text not null check (category in (
    'company', 'product', 'market', 'traction', 'business_model', 'financials', 'team',
    'competition', 'gtm', 'legal_compliance', 'fundraising_materials', 'data_room'
  )),
  title text not null check (length(trim(title)) > 0),
  description text,
  status text not null default 'missing' check (status in ('ready', 'needs_attention', 'missing', 'not_applicable')),
  owner_id uuid,
  -- [{ note, url, dataRoomItemId }] — what shows the item is done.
  evidence jsonb not null default '[]'::jsonb,
  missing_information text,
  recommended_action text,
  due_at date,
  source_refs jsonb not null default '[]'::jsonb,
  -- "Ready" is only ever a person's explicit decision (§22.4); who made it is kept.
  marked_ready_by uuid,
  last_reviewed_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'ready' or marked_ready_by is not null)
);

create index funding_readiness_items_business_id_idx on discovery.funding_readiness_items (business_id, category);

-- ---------------------------------------------------------------------------
-- Data room (§29)
-- ---------------------------------------------------------------------------

create table discovery.data_room_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  round_id uuid references discovery.funding_rounds (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  category text not null check (category in (
    'company', 'corporate', 'product', 'market', 'financial', 'legal', 'tax', 'contracts',
    'ip', 'team', 'fundraising', 'other'
  )),
  -- Null while the document is still missing (a placeholder in the checklist).
  attachment_id uuid references core.attachments (id) on delete restrict,
  status text not null default 'missing' check (status in ('missing', 'draft', 'ready', 'shared', 'expired')),
  description text,
  owner_id uuid,
  -- Replacing a file makes a new version row; the old row stays (and stays shared, if it
  -- was) instead of being overwritten under a recipient's feet (§29.7).
  version integer not null default 1 check (version >= 1),
  supersedes_id uuid references discovery.data_room_items (id) on delete set null,
  is_current boolean not null default true,
  sensitivity text not null default 'confidential' check (sensitivity in ('standard', 'confidential', 'highly_confidential')),
  expires_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'missing' or attachment_id is not null)
);

create index data_room_items_business_id_idx on discovery.data_room_items (business_id, category);

-- A share is an explicit, expiring, revocable grant to one investor or one address
-- (§29.5, §29.6). The link carries a random token; only its SHA-256 is stored, so a
-- leaked database row cannot be turned back into a working link.
create table discovery.data_room_shares (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  data_room_item_id uuid not null references discovery.data_room_items (id) on delete cascade,
  investor_id uuid references discovery.investors (id) on delete set null,
  recipient_email text,
  permission text not null default 'view' check (permission in ('view', 'download')),
  token_hash text not null unique,
  shared_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid,
  created_by uuid default auth.uid(),
  check (investor_id is not null or recipient_email is not null),
  check (expires_at > shared_at)
);

create index data_room_shares_business_id_idx on discovery.data_room_shares (business_id);
create index data_room_shares_item_id_idx on discovery.data_room_shares (data_room_item_id);

-- Written only by the server's share-link handler (service role); members read it.
create table discovery.data_room_access_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  share_id uuid not null references discovery.data_room_shares (id) on delete cascade,
  data_room_item_id uuid not null references discovery.data_room_items (id) on delete cascade,
  action text not null check (action in ('view', 'download')),
  user_agent text,
  accessed_at timestamptz not null default now()
);

create index data_room_access_events_business_id_idx on discovery.data_room_access_events (business_id, accessed_at desc);
create index data_room_access_events_share_id_idx on discovery.data_room_access_events (share_id);

-- ---------------------------------------------------------------------------
-- Due diligence (§30)
-- ---------------------------------------------------------------------------

create table discovery.due_diligence_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  investor_id uuid references discovery.investors (id) on delete set null,
  round_id uuid references discovery.funding_rounds (id) on delete set null,
  request text not null check (length(trim(request)) > 0),
  requester text,
  owner_id uuid,
  due_at date,
  status text not null default 'open' check (status in (
    'open', 'in_progress', 'submitted', 'accepted', 'needs_clarification', 'closed'
  )),
  response text,
  notes text,
  evidence jsonb not null default '[]'::jsonb,
  data_room_item_ids uuid[] not null default '{}',
  -- Acceptance and closure are human decisions (§30.3); who made them is kept.
  decided_by uuid,
  decided_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('accepted', 'closed') or decided_by is not null)
);

create index due_diligence_items_business_id_idx on discovery.due_diligence_items (business_id, status);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create trigger funding_profiles_set_updated_at
  before update on discovery.funding_profiles
  for each row execute function discovery.set_updated_at();
create trigger funding_rounds_set_updated_at
  before update on discovery.funding_rounds
  for each row execute function discovery.set_updated_at();
create trigger investors_set_updated_at
  before update on discovery.investors
  for each row execute function discovery.set_updated_at();
create trigger investor_research_set_updated_at
  before update on discovery.investor_research
  for each row execute function discovery.set_updated_at();
create trigger investor_pipeline_set_updated_at
  before update on discovery.investor_pipeline
  for each row execute function discovery.set_updated_at();
create trigger investor_interactions_set_updated_at
  before update on discovery.investor_interactions
  for each row execute function discovery.set_updated_at();
create trigger investor_outreach_set_updated_at
  before update on discovery.investor_outreach
  for each row execute function discovery.set_updated_at();
create trigger funding_readiness_items_set_updated_at
  before update on discovery.funding_readiness_items
  for each row execute function discovery.set_updated_at();
create trigger data_room_items_set_updated_at
  before update on discovery.data_room_items
  for each row execute function discovery.set_updated_at();
create trigger due_diligence_items_set_updated_at
  before update on discovery.due_diligence_items
  for each row execute function discovery.set_updated_at();

-- ---------------------------------------------------------------------------
-- Atomic stage changes (§25.2, §72): the pipeline row and its history move together
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER: runs as the caller, so the RLS policies below decide what it may
-- touch. Which moves are legal is decided in the domain layer (lib/funding/pipeline.ts);
-- this only makes the update-plus-history atomic and refuses a stale `p_from`, which is
-- how a concurrent change by someone else is caught.
create function discovery.move_investor_stage(p_pipeline_id uuid, p_from text, p_to text, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
begin
  update discovery.investor_pipeline
     set stage = p_to,
         previous_stage = p_from,
         stage_entered_at = now(),
         updated_by = auth.uid()
   where id = p_pipeline_id
     and stage = p_from
  returning business_id, investor_id, round_id into r;

  if not found then
    raise exception 'STAGE_CONFLICT' using errcode = 'P0001';
  end if;

  insert into discovery.investor_stage_history (business_id, pipeline_id, investor_id, round_id, from_stage, to_stage, note)
  values (r.business_id, p_pipeline_id, r.investor_id, r.round_id, p_from, p_to, p_note);
end;
$$;

create function discovery.start_investor_pipeline(p_business_id uuid, p_investor_id uuid, p_round_id uuid, p_stage text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into discovery.investor_pipeline (business_id, investor_id, round_id, stage)
  values (p_business_id, p_investor_id, p_round_id, p_stage)
  returning id into v_id;

  insert into discovery.investor_stage_history (business_id, pipeline_id, investor_id, round_id, from_stage, to_stage)
  values (p_business_id, v_id, p_investor_id, p_round_id, null, p_stage);

  return v_id;
end;
$$;

revoke all on function discovery.move_investor_stage(uuid, text, text, text) from public;
revoke all on function discovery.start_investor_pipeline(uuid, uuid, uuid, text) from public;
grant execute on function discovery.move_investor_stage(uuid, text, text, text) to authenticated;
grant execute on function discovery.start_investor_pipeline(uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security — tenant AND licensed, plus funding permissions
-- ---------------------------------------------------------------------------

alter table discovery.funding_profiles enable row level security;
alter table discovery.funding_rounds enable row level security;
alter table discovery.investors enable row level security;
alter table discovery.investor_research enable row level security;
alter table discovery.investor_pipeline enable row level security;
alter table discovery.investor_interactions enable row level security;
alter table discovery.investor_outreach enable row level security;
alter table discovery.funding_readiness_items enable row level security;
alter table discovery.data_room_items enable row level security;
alter table discovery.due_diligence_items enable row level security;
alter table discovery.investor_stage_history enable row level security;
alter table discovery.data_room_shares enable row level security;
alter table discovery.data_room_access_events enable row level security;

create policy "funding viewers can view funding profiles"
  on discovery.funding_profiles for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create funding profiles"
  on discovery.funding_profiles for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update funding profiles"
  on discovery.funding_profiles for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view funding rounds"
  on discovery.funding_rounds for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create funding rounds"
  on discovery.funding_rounds for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update funding rounds"
  on discovery.funding_rounds for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view investors"
  on discovery.investors for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create investors"
  on discovery.investors for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update investors"
  on discovery.investors for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view investor research"
  on discovery.investor_research for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create investor research"
  on discovery.investor_research for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update investor research"
  on discovery.investor_research for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can delete investor research"
  on discovery.investor_research for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view investor pipeline records"
  on discovery.investor_pipeline for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create investor pipeline records"
  on discovery.investor_pipeline for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update investor pipeline records"
  on discovery.investor_pipeline for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view investor stage history"
  on discovery.investor_stage_history for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create investor stage history"
  on discovery.investor_stage_history for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view investor interactions"
  on discovery.investor_interactions for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create investor interactions"
  on discovery.investor_interactions for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update investor interactions"
  on discovery.investor_interactions for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can delete investor interactions"
  on discovery.investor_interactions for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view investor outreach"
  on discovery.investor_outreach for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create investor outreach"
  on discovery.investor_outreach for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update investor outreach"
  on discovery.investor_outreach for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view readiness items"
  on discovery.funding_readiness_items for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create readiness items"
  on discovery.funding_readiness_items for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update readiness items"
  on discovery.funding_readiness_items for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can delete readiness items"
  on discovery.funding_readiness_items for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view data room items"
  on discovery.data_room_items for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create data room items"
  on discovery.data_room_items for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update data room items"
  on discovery.data_room_items for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can delete data room items"
  on discovery.data_room_items for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

create policy "funding viewers can view data room shares"
  on discovery.data_room_shares for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding approvers can create data room shares"
  on discovery.data_room_shares for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.approve')
  );
create policy "funding approvers can update data room shares"
  on discovery.data_room_shares for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.approve')
  );

create policy "funding viewers can view data room access events"
  on discovery.data_room_access_events for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );

create policy "funding viewers can view diligence items"
  on discovery.due_diligence_items for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.view')
  );
create policy "funding managers can create diligence items"
  on discovery.due_diligence_items for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );
create policy "funding managers can update diligence items"
  on discovery.due_diligence_items for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'funding.manage')
  );

