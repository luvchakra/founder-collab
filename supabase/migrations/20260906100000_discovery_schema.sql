-- Discovery module schema — end-state consolidation of co-founder-ai's 23 migrations
-- (source commit befc3ac1a1413e220afab1f6f9cea1509f801d2e; full list and content in
-- docs/PORT-PROVENANCE.md and docs/BASELINE-DISCOVERY.md), per
-- docs/plan/05-SP0-AUDIT-AND-GREENFIELD-REVISION.md §B.3: "extract, don't replay" — this
-- is the end state, not a replay of co-founder-ai's own create-then-alter history.
--
-- Lives in its own `discovery` schema from day one (05 §B.2 correction — no legacy
-- `public` schema to preserve in a greenfield build), with `workspace_id` intact as the
-- tenant boundary (ADR-4: workspace_id stays the tenant for discovery only).
--
-- NOT YET DONE (deliberately, tracked for Epic 2's C-1): `discovery.accounts`,
-- `account_members`, `businesses`, `products`, `workspaces` are co-founder-ai's own
-- tenancy tables, ported here unchanged. 00-MASTER-PLAN.md §5's entity-ownership map
-- says Account/Business are `core` concepts shared by every module ("exists today") —
-- merging these into `core.accounts`/`core.businesses` is Epic 2's job, once `core`
-- exists and there's a second module to share them with. Until then this is discovery's
-- own copy, functionally identical to the source app.
--
-- Every `security definer` helper function and RLS policy below is the exact pattern
-- from co-founder-ai's migrations, schema-qualified to `discovery` instead of `public`.

create schema if not exists discovery;

-- ---------------------------------------------------------------------------
-- Tenancy: accounts -> account_members / businesses -> products -> workspaces
-- ---------------------------------------------------------------------------

create table discovery.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table discovery.account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references discovery.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (account_id, user_id)
);

create table discovery.businesses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references discovery.accounts (id) on delete cascade,
  name text not null,
  description text,
  website text,
  industry text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table discovery.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references discovery.businesses (id) on delete cascade,
  name text not null,
  description text,
  website text,
  status text not null default 'active' check (status in ('active', 'archived')),
  product_profile jsonb,
  product_profile_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table discovery.workspaces (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references discovery.products (id) on delete cascade,
  name text not null default 'Default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_members_user_id_idx on discovery.account_members (user_id);
create index account_members_account_id_idx on discovery.account_members (account_id);
create index businesses_account_id_idx on discovery.businesses (account_id);
create index products_business_id_idx on discovery.products (business_id);
create index workspaces_product_id_idx on discovery.workspaces (product_id);

-- ---------------------------------------------------------------------------
-- Product intelligence, AI usage ledger
-- ---------------------------------------------------------------------------

create table discovery.product_knowledge (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  source_type text not null check (source_type in ('manual', 'website', 'document', 'url')),
  source_name text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_knowledge_workspace_id_idx on discovery.product_knowledge (workspace_id);

-- ai_runs: usage/cost ledger, extended by BYOK (account_id/provider/duration_ms/
-- error_code) and web-search cost controls (search_count). Append-only from the app.
create table discovery.ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  account_id uuid references discovery.accounts (id) on delete cascade,
  operation text not null,
  model text not null,
  provider text,
  prompt_version text not null,
  input_hash text not null,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric(10, 6),
  duration_ms integer,
  search_count integer,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  error_code text,
  created_at timestamptz not null default now()
);

create index ai_runs_workspace_id_idx on discovery.ai_runs (workspace_id);
create index ai_runs_account_id_idx on discovery.ai_runs (account_id);
create index ai_runs_cache_lookup_idx
  on discovery.ai_runs (workspace_id, operation, input_hash)
  where status = 'succeeded';

-- One in-flight discovery-run lock per workspace (docs/ai-usage-cost-requirements.md
-- R6) -- discoverProspects has no stable input to hash for dedup, so two overlapping
-- runs for the same workspace are prevented by lock row presence instead.
create table discovery.prospect_discovery_locks (
  workspace_id uuid primary key references discovery.workspaces (id) on delete cascade,
  started_at timestamptz not null default now()
);

-- One connected BYOK AI provider per account (docs/byok-ai-requirements.md §13).
-- encrypted_api_key is application-level AES-256-GCM ciphertext
-- (packages/core/src/crypto/api-key.ts) -- RLS does not by itself protect a column from
-- application code, so only the router's internal credential lookup selects it.
create table discovery.ai_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references discovery.accounts (id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'google')),
  encrypted_api_key text not null,
  key_fingerprint text not null,
  status text not null default 'connected' check (status in ('connected', 'error')),
  last_validated_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id)
);

create index ai_provider_credentials_account_id_idx on discovery.ai_provider_credentials (account_id);

-- ---------------------------------------------------------------------------
-- ICP
-- ---------------------------------------------------------------------------

create table discovery.icp_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references discovery.workspaces (id) on delete cascade,
  name text not null default 'Ideal Customer Profile',
  description text,
  industries text[] not null default '{}',
  company_sizes text[] not null default '{}',
  geographies text[] not null default '{}',
  roles text[] not null default '{}',
  pain_points text[] not null default '{}',
  buying_signals text[] not null default '{}',
  exclusions text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Prospects, contacts, suggestions
-- ---------------------------------------------------------------------------

create table discovery.prospects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  company_name text not null,
  website text,
  domain text,
  industry text,
  company_size text,
  location text,
  description text,
  status text not null default 'new' check (status in ('new', 'qualified', 'disqualified')),
  outcome text not null default 'open' check (outcome in ('open', 'won', 'lost')),
  fit_score integer check (fit_score is null or (fit_score >= 0 and fit_score <= 100)),
  linkedin_url text,
  twitter_url text,
  company_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prospects_workspace_id_idx on discovery.prospects (workspace_id);

create table discovery.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  first_name text,
  last_name text,
  job_title text,
  email text,
  linkedin_url text,
  phone text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_workspace_id_idx on discovery.contacts (workspace_id);
create index contacts_prospect_id_idx on discovery.contacts (prospect_id);

create table discovery.prospect_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  company_name text not null,
  website text,
  industry text,
  company_size text,
  location text,
  description text,
  match_reason text,
  source_url text,
  created_at timestamptz not null default now()
);

create index prospect_suggestions_workspace_id_idx on discovery.prospect_suggestions (workspace_id);

-- ---------------------------------------------------------------------------
-- Research, scoring
-- ---------------------------------------------------------------------------

create table discovery.prospect_research (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null unique references discovery.prospects (id) on delete cascade,
  summary text,
  pain_points text[] not null default '{}',
  buying_signals text[] not null default '{}',
  recent_events text[] not null default '{}',
  recommended_angle text,
  evidence jsonb not null default '[]'::jsonb,
  researched_at timestamptz not null default now(),
  expires_at timestamptz
);

create index prospect_research_workspace_id_idx on discovery.prospect_research (workspace_id);

-- Append-only (no unique on prospect_id): a rescore must not destroy prior scores
-- (prospects-pipeline-redesign-requirements.md R8).
create table discovery.prospect_scores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  icp_score integer not null check (icp_score between 0 and 100),
  intent_score integer not null check (intent_score between 0 and 100),
  timing_score integer not null check (timing_score between 0 and 100),
  overall_score integer not null check (overall_score between 0 and 100),
  reasoning text,
  created_at timestamptz not null default now()
);

create index prospect_scores_workspace_id_idx on discovery.prospect_scores (workspace_id);
create index prospect_scores_prospect_id_idx on discovery.prospect_scores (prospect_id);

-- ---------------------------------------------------------------------------
-- Outreach, conversations
-- ---------------------------------------------------------------------------

create table discovery.outreach_strategies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  contact_id uuid references discovery.contacts (id) on delete set null,
  strategy text not null,
  channel text not null check (channel in ('email', 'linkedin', 'whatsapp')),
  reason text not null,
  key_message text not null,
  cta text not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outreach_strategies_workspace_id_idx on discovery.outreach_strategies (workspace_id);
create index outreach_strategies_prospect_id_idx on discovery.outreach_strategies (prospect_id);
create index outreach_strategies_contact_id_idx on discovery.outreach_strategies (contact_id);

create table discovery.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  contact_id uuid references discovery.contacts (id) on delete set null,
  channel text not null check (channel in ('email', 'linkedin', 'whatsapp')),
  status text not null default 'awaiting_reply' check (status in ('awaiting_reply', 'replied', 'closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_workspace_id_idx on discovery.conversations (workspace_id);
create index conversations_prospect_id_idx on discovery.conversations (prospect_id);
create index conversations_contact_id_idx on discovery.conversations (contact_id);

create table discovery.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  contact_id uuid references discovery.contacts (id) on delete set null,
  conversation_id uuid references discovery.conversations (id) on delete set null,
  channel text not null check (channel in ('email', 'linkedin', 'whatsapp')),
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  subject text,
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'failed')),
  classification text check (
    classification in (
      'interested', 'not_interested', 'question', 'objection',
      'out_of_office', 'unsubscribe', 'other'
    )
  ),
  recommended_action text,
  sent_at timestamptz,
  failure_reason text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index messages_workspace_id_idx on discovery.messages (workspace_id);
create index messages_prospect_id_idx on discovery.messages (prospect_id);
create index messages_conversation_id_idx on discovery.messages (conversation_id);
create index messages_contact_id_idx on discovery.messages (contact_id);
create index messages_provider_message_id_idx on discovery.messages (provider_message_id);

-- ---------------------------------------------------------------------------
-- Chat, interest signups (no tenant scope -- pre-signup anonymous visitors)
-- ---------------------------------------------------------------------------

create table discovery.chat_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  follow_up text,
  created_at timestamptz not null default now()
);

create index chat_messages_workspace_id_created_at_idx
  on discovery.chat_messages (workspace_id, created_at);

-- No account_id/business_id/product_id/workspace_id: captured from anonymous landing-
-- page visitors before any account exists. RLS enabled with zero policies -- the only
-- access path is the service-role admin client, called from a server action.
create table discovery.interest_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function discovery.set_updated_at()
returns trigger
language plpgsql
set search_path = discovery
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger accounts_set_updated_at
  before update on discovery.accounts
  for each row execute function discovery.set_updated_at();
create trigger businesses_set_updated_at
  before update on discovery.businesses
  for each row execute function discovery.set_updated_at();
create trigger products_set_updated_at
  before update on discovery.products
  for each row execute function discovery.set_updated_at();
create trigger workspaces_set_updated_at
  before update on discovery.workspaces
  for each row execute function discovery.set_updated_at();
create trigger product_knowledge_set_updated_at
  before update on discovery.product_knowledge
  for each row execute function discovery.set_updated_at();
create trigger icp_profiles_set_updated_at
  before update on discovery.icp_profiles
  for each row execute function discovery.set_updated_at();
create trigger prospects_set_updated_at
  before update on discovery.prospects
  for each row execute function discovery.set_updated_at();
create trigger contacts_set_updated_at
  before update on discovery.contacts
  for each row execute function discovery.set_updated_at();
create trigger outreach_strategies_set_updated_at
  before update on discovery.outreach_strategies
  for each row execute function discovery.set_updated_at();
create trigger messages_set_updated_at
  before update on discovery.messages
  for each row execute function discovery.set_updated_at();
create trigger conversations_set_updated_at
  before update on discovery.conversations
  for each row execute function discovery.set_updated_at();
create trigger ai_provider_credentials_set_updated_at
  before update on discovery.ai_provider_credentials
  for each row execute function discovery.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tenant-resolution helper functions.
--
-- SECURITY DEFINER so the body runs with the owning role's privileges and is NOT itself
-- subject to the RLS policies below -- this is what breaks the recursion that would
-- otherwise occur (a policy on account_members calling a function that queries
-- account_members through that same policy). Each function explicitly filters by
-- auth.uid(), so it never leaks another user's data despite bypassing RLS internally.
-- ---------------------------------------------------------------------------

create function discovery.user_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery
as $$
  select account_id from discovery.account_members where user_id = auth.uid();
$$;

create function discovery.user_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery
as $$
  select b.id from discovery.businesses b where b.account_id in (select discovery.user_account_ids());
$$;

create function discovery.user_product_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery
as $$
  select p.id from discovery.products p where p.business_id in (select discovery.user_business_ids());
$$;

create function discovery.user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery
as $$
  select w.id from discovery.workspaces w where w.product_id in (select discovery.user_product_ids());
$$;

revoke execute on function discovery.user_account_ids() from public, anon;
revoke execute on function discovery.user_business_ids() from public, anon;
revoke execute on function discovery.user_product_ids() from public, anon;
revoke execute on function discovery.user_workspace_ids() from public, anon;
grant execute on function discovery.user_account_ids() to authenticated;
grant execute on function discovery.user_business_ids() to authenticated;
grant execute on function discovery.user_product_ids() to authenticated;
grant execute on function discovery.user_workspace_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table discovery.accounts enable row level security;
alter table discovery.account_members enable row level security;
alter table discovery.businesses enable row level security;
alter table discovery.products enable row level security;
alter table discovery.workspaces enable row level security;
alter table discovery.product_knowledge enable row level security;
alter table discovery.ai_runs enable row level security;
alter table discovery.prospect_discovery_locks enable row level security;
alter table discovery.ai_provider_credentials enable row level security;
alter table discovery.icp_profiles enable row level security;
alter table discovery.prospects enable row level security;
alter table discovery.contacts enable row level security;
alter table discovery.prospect_suggestions enable row level security;
alter table discovery.prospect_research enable row level security;
alter table discovery.prospect_scores enable row level security;
alter table discovery.outreach_strategies enable row level security;
alter table discovery.conversations enable row level security;
alter table discovery.messages enable row level security;
alter table discovery.chat_messages enable row level security;
alter table discovery.interest_signups enable row level security;

-- accounts: members can view; owners/admins can update. No client-side insert/delete --
-- accounts are created only via handle_new_user() below.
create policy "members can view their accounts"
  on discovery.accounts for select
  using (id in (select discovery.user_account_ids()));

create policy "owners and admins can update their accounts"
  on discovery.accounts for update
  using (
    id in (
      select account_id from discovery.account_members
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
  );

-- account_members: members can view membership of their own accounts; owners/admins can
-- manage membership.
create policy "members can view membership of their accounts"
  on discovery.account_members for select
  using (account_id in (select discovery.user_account_ids()));

create policy "owners and admins can add members"
  on discovery.account_members for insert
  with check (
    account_id in (
      select account_id from discovery.account_members
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
  );

create policy "owners and admins can remove members"
  on discovery.account_members for delete
  using (
    account_id in (
      select account_id from discovery.account_members
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
  );

-- businesses: any member of the owning account can view/create/update/delete.
create policy "members can view businesses in their account"
  on discovery.businesses for select
  using (account_id in (select discovery.user_account_ids()));
create policy "members can create businesses in their account"
  on discovery.businesses for insert
  with check (account_id in (select discovery.user_account_ids()));
create policy "members can update businesses in their account"
  on discovery.businesses for update
  using (account_id in (select discovery.user_account_ids()));
create policy "members can delete businesses in their account"
  on discovery.businesses for delete
  using (account_id in (select discovery.user_account_ids()));

-- products: any member of the owning business's account.
create policy "members can view products in their businesses"
  on discovery.products for select
  using (business_id in (select discovery.user_business_ids()));
create policy "members can create products in their businesses"
  on discovery.products for insert
  with check (business_id in (select discovery.user_business_ids()));
create policy "members can update products in their businesses"
  on discovery.products for update
  using (business_id in (select discovery.user_business_ids()));
create policy "members can delete products in their businesses"
  on discovery.products for delete
  using (business_id in (select discovery.user_business_ids()));

-- workspaces: view/update only -- creation happens via create_default_workspace() below.
create policy "members can view workspaces in their products"
  on discovery.workspaces for select
  using (product_id in (select discovery.user_product_ids()));
create policy "members can update workspaces in their products"
  on discovery.workspaces for update
  using (product_id in (select discovery.user_product_ids()));

-- Every workspace-scoped table below follows the identical four-policy (or fewer, where
-- the source app never allowed an operation) pattern against discovery.user_workspace_ids().

create policy "members can view product knowledge in their workspaces"
  on discovery.product_knowledge for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create product knowledge in their workspaces"
  on discovery.product_knowledge for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update product knowledge in their workspaces"
  on discovery.product_knowledge for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete product knowledge in their workspaces"
  on discovery.product_knowledge for delete
  using (workspace_id in (select discovery.user_workspace_ids()));

-- ai_runs: append-only usage ledger -- view and insert, never update/delete.
create policy "members can view ai runs in their workspaces"
  on discovery.ai_runs for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create ai runs in their workspaces"
  on discovery.ai_runs for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));

create policy "members can view discovery locks in their workspaces"
  on discovery.prospect_discovery_locks for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create discovery locks in their workspaces"
  on discovery.prospect_discovery_locks for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update discovery locks in their workspaces"
  on discovery.prospect_discovery_locks for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete discovery locks in their workspaces"
  on discovery.prospect_discovery_locks for delete
  using (workspace_id in (select discovery.user_workspace_ids()));

create policy "members can view their account's ai provider credential"
  on discovery.ai_provider_credentials for select
  using (account_id in (select discovery.user_account_ids()));
create policy "members can create their account's ai provider credential"
  on discovery.ai_provider_credentials for insert
  with check (account_id in (select discovery.user_account_ids()));
create policy "members can update their account's ai provider credential"
  on discovery.ai_provider_credentials for update
  using (account_id in (select discovery.user_account_ids()));
create policy "members can delete their account's ai provider credential"
  on discovery.ai_provider_credentials for delete
  using (account_id in (select discovery.user_account_ids()));

create policy "members can view icp profiles in their workspaces"
  on discovery.icp_profiles for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create icp profiles in their workspaces"
  on discovery.icp_profiles for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update icp profiles in their workspaces"
  on discovery.icp_profiles for update
  using (workspace_id in (select discovery.user_workspace_ids()));

create policy "members can view prospects in their workspaces"
  on discovery.prospects for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create prospects in their workspaces"
  on discovery.prospects for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update prospects in their workspaces"
  on discovery.prospects for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete prospects in their workspaces"
  on discovery.prospects for delete
  using (workspace_id in (select discovery.user_workspace_ids()));

create policy "members can view contacts in their workspaces"
  on discovery.contacts for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create contacts in their workspaces"
  on discovery.contacts for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update contacts in their workspaces"
  on discovery.contacts for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete contacts in their workspaces"
  on discovery.contacts for delete
  using (workspace_id in (select discovery.user_workspace_ids()));

-- prospect_suggestions: no update policy -- a suggestion is approved (deleted here,
-- inserted into prospects) or discarded (deleted here); nothing else changes it.
create policy "members can view prospect suggestions in their workspaces"
  on discovery.prospect_suggestions for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create prospect suggestions in their workspaces"
  on discovery.prospect_suggestions for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete prospect suggestions in their workspaces"
  on discovery.prospect_suggestions for delete
  using (workspace_id in (select discovery.user_workspace_ids()));

create policy "members can view prospect research in their workspaces"
  on discovery.prospect_research for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create prospect research in their workspaces"
  on discovery.prospect_research for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update prospect research in their workspaces"
  on discovery.prospect_research for update
  using (workspace_id in (select discovery.user_workspace_ids()));

-- prospect_scores: append-only -- view and insert, never update/delete (R8).
create policy "members can view prospect scores in their workspaces"
  on discovery.prospect_scores for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create prospect scores in their workspaces"
  on discovery.prospect_scores for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));

create policy "members can view outreach strategies in their workspaces"
  on discovery.outreach_strategies for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create outreach strategies in their workspaces"
  on discovery.outreach_strategies for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update outreach strategies in their workspaces"
  on discovery.outreach_strategies for update
  using (workspace_id in (select discovery.user_workspace_ids()));

create policy "members can view conversations in their workspaces"
  on discovery.conversations for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create conversations in their workspaces"
  on discovery.conversations for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update conversations in their workspaces"
  on discovery.conversations for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete conversations in their workspaces"
  on discovery.conversations for delete
  using (workspace_id in (select discovery.user_workspace_ids()));

create policy "members can view messages in their workspaces"
  on discovery.messages for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create messages in their workspaces"
  on discovery.messages for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update messages in their workspaces"
  on discovery.messages for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete messages in their workspaces"
  on discovery.messages for delete
  using (workspace_id in (select discovery.user_workspace_ids()));

-- chat_messages: append-only history -- no update/delete policy.
create policy "members can view chat messages in their workspaces"
  on discovery.chat_messages for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create chat messages in their workspaces"
  on discovery.chat_messages for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));

-- interest_signups: RLS enabled with deliberately zero policies -- submissions come from
-- anonymous visitors with no auth.uid() to scope a policy to. The only access path is
-- the service-role admin client (packages/core/src/db/admin.ts), called from a server
-- action, never the browser.

-- ---------------------------------------------------------------------------
-- Auto-provisioning
-- ---------------------------------------------------------------------------

-- Every new auth user gets their own account as owner. Prefers the signup form's Name
-- field (raw_user_meta_data.full_name) over the email-prefix fallback.
create function discovery.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = discovery
as $$
declare
  new_account_id uuid;
begin
  insert into discovery.accounts (name)
  values (
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'My'
    ) || '''s Account'
  )
  returning id into new_account_id;

  insert into discovery.account_members (account_id, user_id, role)
  values (new_account_id, new.id, 'owner');

  return new;
end;
$$;

revoke execute on function discovery.handle_new_user() from public, anon, authenticated;

create trigger on_discovery_user_created
  after insert on auth.users
  for each row execute function discovery.handle_new_user();

-- Every product gets at least one GTM workspace.
create function discovery.create_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = discovery
as $$
begin
  insert into discovery.workspaces (product_id, name) values (new.id, 'Default');
  return new;
end;
$$;

revoke execute on function discovery.create_default_workspace() from public, anon, authenticated;

create trigger on_discovery_product_created
  after insert on discovery.products
  for each row execute function discovery.create_default_workspace();

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------

-- Avatars: public bucket, writes restricted to the owning user via uid as the first
-- path segment (avatars/<user_id>/<filename>).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own avatar"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own avatar"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Knowledge files: private bucket, path convention <workspace_id>/<filename>.
insert into storage.buckets (id, name, public)
values ('knowledge-files', 'knowledge-files', false)
on conflict (id) do nothing;

create policy "Members can read their workspaces' knowledge files"
on storage.objects for select
using (
  bucket_id = 'knowledge-files'
  and (storage.foldername(name))[1]::uuid in (select discovery.user_workspace_ids())
);

create policy "Members can upload knowledge files to their workspaces"
on storage.objects for insert
with check (
  bucket_id = 'knowledge-files'
  and (storage.foldername(name))[1]::uuid in (select discovery.user_workspace_ids())
);

create policy "Members can delete their workspaces' knowledge files"
on storage.objects for delete
using (
  bucket_id = 'knowledge-files'
  and (storage.foldername(name))[1]::uuid in (select discovery.user_workspace_ids())
);
