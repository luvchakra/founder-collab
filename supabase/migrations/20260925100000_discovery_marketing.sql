-- MKT-02 — Marketing foundation tables for Discovery.
--
-- Marketing is not a new licensable module: it is a capability *inside* Discovery
-- (DISC-NAV-04), so every table here is gated by the existing `discovery` entitlement
-- rather than a new module key. Nothing in the existing Discovery schema is altered —
-- these tables reference `discovery.products` (the canonical offering master) and
-- `discovery.icp_profiles` by id and never copy their content.
--
-- Two deliberate non-tables, per the "no duplicate entity" rule:
--   * no `marketing_channels` lookup — a channel is a small finite value, carried as
--     text with a check constraint like every other status in this schema. A table
--     would add a join and a seeding story for no behaviour.
--   * no storage of file bytes — `core.attachments` already owns uploads with a
--     polymorphic entity_type/entity_id, so `marketing_assets` carries the marketing
--     *meaning* and points at an attachment for the file itself.
--
-- RLS is `tenant AND licensed` on every table (CLAUDE.md non-negotiable 2), following
-- the pattern gst's accounting tables use: reads need an active-or-grace licence,
-- writes need a write licence plus an RBAC permission. The older Discovery tables
-- predate that rule and are deliberately left alone; new tables meet it.
--
-- Grants are not issued here on purpose: 20260907120000_grant_schema_privileges.sql
-- sets `alter default privileges in schema discovery`, so tables created after it are
-- granted to authenticated/service_role automatically. `npm run lint:migration-grants`
-- knows about that schema-wide grant and will not flag these.

-- ---------------------------------------------------------------------------
-- Permissions (extends the existing core RBAC catalogue — no new framework)
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('marketing.view', 'discovery', 'View marketing strategy, campaigns, content, assets and analytics'),
  ('marketing.manage', 'discovery', 'Create and update marketing strategy, campaigns, content and assets'),
  ('marketing.approve', 'discovery', 'Approve marketing content for scheduling and publishing')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key)
select r, p.key
from core.permissions p, unnest(array['owner', 'admin']) as r
where p.key in ('marketing.view', 'marketing.manage', 'marketing.approve')
on conflict (role, permission_key) do nothing;

-- Mapped onto roles that actually exist in core.role_permissions. A sales manager runs
-- demand generation day to day, so manages marketing but does not approve what is
-- published under the business's name; a viewer reads without changing anything.
insert into core.role_permissions (role, permission_key) values
  ('sales_manager', 'marketing.view'),
  ('sales_manager', 'marketing.manage'),
  ('viewer', 'marketing.view')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Strategy (§8)
-- ---------------------------------------------------------------------------

-- Versioned rather than overwritten: a strategy is the document a founder argues from,
-- and losing what it said last quarter loses the argument. `status` carries the
-- version's own lifecycle; `supersedes_id` chains a revision to what it replaced.
create table discovery.marketing_strategies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  -- Nullable: a strategy may be company-wide or scoped to one offering (§5.1).
  offering_id uuid references discovery.products (id) on delete set null,
  name text not null default 'Marketing Strategy',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  version_number integer not null default 1,
  supersedes_id uuid references discovery.marketing_strategies (id) on delete set null,
  positioning jsonb not null default '{}'::jsonb,
  value_proposition jsonb not null default '{}'::jsonb,
  differentiation jsonb not null default '{}'::jsonb,
  target_markets jsonb not null default '{}'::jsonb,
  messaging jsonb not null default '{}'::jsonb,
  channels jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  -- Where the content came from: offering/ICP/research ids plus AI run ids (§5.2).
  source_refs jsonb not null default '{}'::jsonb,
  -- 'user' or 'ai_draft' — an AI draft is never an authoritative strategy until a
  -- person activates it (§5.2, §8.2).
  origin text not null default 'user' check (origin in ('user', 'ai_draft')),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one active strategy per scope (§8.3). Two partial indexes because NULL
-- offering_id is a distinct scope from any given offering, and a plain unique index
-- would not treat two NULLs as equal.
create unique index marketing_strategies_one_active_per_business_idx
  on discovery.marketing_strategies (business_id)
  where status = 'active' and offering_id is null;
create unique index marketing_strategies_one_active_per_offering_idx
  on discovery.marketing_strategies (business_id, offering_id)
  where status = 'active' and offering_id is not null;
create index marketing_strategies_business_id_idx on discovery.marketing_strategies (business_id);
create index marketing_strategies_offering_id_idx on discovery.marketing_strategies (offering_id);

-- ---------------------------------------------------------------------------
-- Campaigns (§9)
-- ---------------------------------------------------------------------------

create table discovery.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  offering_id uuid references discovery.products (id) on delete set null,
  icp_profile_id uuid references discovery.icp_profiles (id) on delete set null,
  name text not null,
  description text,
  objective text not null check (objective in (
    'awareness', 'traffic', 'engagement', 'lead_generation', 'qualified_leads',
    'opportunity_creation', 'customer_acquisition', 'retention', 'other'
  )),
  channel text not null check (channel in (
    'website', 'seo', 'linkedin', 'email', 'events', 'partnerships',
    'paid_search', 'paid_social', 'communities', 'referrals', 'other'
  )),
  audience jsonb not null default '{}'::jsonb,
  owner_id uuid,
  -- numeric, never float (§35.3); currency required whenever an amount exists.
  budget numeric(14, 2) check (budget is null or budget >= 0),
  currency text,
  start_at timestamptz,
  end_at timestamptz,
  landing_page_url text,
  message text,
  cta text,
  utm jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in (
    'draft', 'planned', 'active', 'paused', 'completed', 'archived'
  )),
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- §52 Marketing rules 3 and 4, enforced by the database rather than only the form.
  constraint marketing_campaigns_dates_ordered check (end_at is null or start_at is null or end_at >= start_at),
  constraint marketing_campaigns_currency_with_budget check (budget is null or currency is not null),
  -- §52 rule 1: a campaign cannot be Active without the facts that make it measurable.
  constraint marketing_campaigns_active_needs_start check (status <> 'active' or start_at is not null)
);

create index marketing_campaigns_business_id_idx on discovery.marketing_campaigns (business_id);
create index marketing_campaigns_offering_id_idx on discovery.marketing_campaigns (offering_id);
create index marketing_campaigns_business_status_idx on discovery.marketing_campaigns (business_id, status);
create index marketing_campaigns_business_start_idx on discovery.marketing_campaigns (business_id, start_at desc);
create index marketing_campaigns_end_at_idx on discovery.marketing_campaigns (end_at) where end_at is not null;

-- ---------------------------------------------------------------------------
-- Campaign metrics (§10)
-- ---------------------------------------------------------------------------

-- Snapshot rows, not mutable columns on the campaign: a campaign's numbers are a time
-- series from a named source, and collapsing them onto the campaign loses both the
-- history and which source said what. Every count is nullable on purpose — a source
-- that does not report clicks must read as "unavailable", never as 0 (§10, §40, §52.9).
create table discovery.marketing_campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  campaign_id uuid not null references discovery.marketing_campaigns (id) on delete cascade,
  metric_date date not null,
  source text not null check (source in ('manual', 'import', 'website', 'provider', 'computed')),
  impressions bigint check (impressions is null or impressions >= 0),
  clicks bigint check (clicks is null or clicks >= 0),
  sessions bigint check (sessions is null or sessions >= 0),
  engagements bigint check (engagements is null or engagements >= 0),
  leads bigint check (leads is null or leads >= 0),
  qualified_leads bigint check (qualified_leads is null or qualified_leads >= 0),
  opportunities bigint check (opportunities is null or opportunities >= 0),
  customers bigint check (customers is null or customers >= 0),
  revenue numeric(14, 2) check (revenue is null or revenue >= 0),
  spend numeric(14, 2) check (spend is null or spend >= 0),
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint marketing_campaign_metrics_currency_with_money
    check ((revenue is null and spend is null) or currency is not null)
);

-- Re-importing the same day from the same source updates rather than duplicates (§10).
create unique index marketing_campaign_metrics_unique_idx
  on discovery.marketing_campaign_metrics (campaign_id, metric_date, source);
create index marketing_campaign_metrics_business_id_idx on discovery.marketing_campaign_metrics (business_id);
create index marketing_campaign_metrics_campaign_date_idx
  on discovery.marketing_campaign_metrics (campaign_id, metric_date desc);

-- ---------------------------------------------------------------------------
-- Attribution (§11)
-- ---------------------------------------------------------------------------

-- Links a campaign to something that already exists elsewhere in Discovery. The entity
-- is referenced by id without a foreign key on purpose: `entity_type` spans prospects,
-- opportunities and customers, which live in different tables (and, for customers, in
-- `core`), so a single FK cannot express it. Ownership of those records does not move.
create table discovery.marketing_attributions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  campaign_id uuid not null references discovery.marketing_campaigns (id) on delete cascade,
  entity_type text not null check (entity_type in ('prospect', 'opportunity', 'customer')),
  entity_id uuid not null,
  touch_type text not null check (touch_type in ('first_touch', 'last_touch', 'influenced')),
  -- How we know. 'inferred' is AI's label and must stay distinguishable from evidence
  -- a person or an import actually supplied (§11).
  source text not null check (source in ('manual', 'import', 'utm', 'inferred')),
  occurred_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index marketing_attributions_unique_idx
  on discovery.marketing_attributions (campaign_id, entity_type, entity_id, touch_type);
create index marketing_attributions_business_id_idx on discovery.marketing_attributions (business_id);
create index marketing_attributions_entity_idx on discovery.marketing_attributions (business_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Content + versions (§12)
-- ---------------------------------------------------------------------------

create table discovery.marketing_content (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  offering_id uuid references discovery.products (id) on delete set null,
  campaign_id uuid references discovery.marketing_campaigns (id) on delete set null,
  title text not null,
  content_type text not null check (content_type in (
    'blog', 'social', 'email', 'case_study', 'whitepaper', 'webinar',
    'video', 'landing_page', 'ad_copy', 'other'
  )),
  brief text,
  body text,
  summary text,
  audience text,
  channel text,
  seo_metadata jsonb not null default '{}'::jsonb,
  cta text,
  status text not null default 'idea' check (status in (
    'idea', 'draft', 'review', 'approved', 'scheduled', 'published', 'archived'
  )),
  owner_id uuid,
  -- Published content points at the exact version that went out (§12.6). FK added
  -- after the versions table exists.
  published_version_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  scheduled_at timestamptz,
  published_at timestamptz,
  external_url text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- §52 rule 5: published content must name the approved version it published.
  constraint marketing_content_published_has_version
    check (status <> 'published' or published_version_id is not null),
  constraint marketing_content_scheduled_has_date
    check (status <> 'scheduled' or scheduled_at is not null)
);

create index marketing_content_business_id_idx on discovery.marketing_content (business_id);
create index marketing_content_business_status_idx on discovery.marketing_content (business_id, status);
create index marketing_content_campaign_id_idx on discovery.marketing_content (campaign_id);
create index marketing_content_offering_id_idx on discovery.marketing_content (offering_id);
-- The calendar reads a date window (§15).
create index marketing_content_scheduled_idx
  on discovery.marketing_content (business_id, scheduled_at)
  where scheduled_at is not null;

-- Append-only: `created_at` only, no `updated_at` (§35.2). Editing approved content
-- writes a new version rather than mutating the one that was approved (§12.6).
create table discovery.marketing_content_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  content_id uuid not null references discovery.marketing_content (id) on delete cascade,
  version_number integer not null,
  title text not null,
  body text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  -- Which AI operation produced it, when one did (§13, §5.2).
  origin text not null default 'user' check (origin in ('user', 'ai_generated', 'ai_rewritten', 'ai_repurposed')),
  source_refs jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index marketing_content_versions_unique_idx
  on discovery.marketing_content_versions (content_id, version_number);
create index marketing_content_versions_business_id_idx on discovery.marketing_content_versions (business_id);

alter table discovery.marketing_content
  add constraint marketing_content_published_version_fk
  foreign key (published_version_id)
  references discovery.marketing_content_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Assets (§14)
-- ---------------------------------------------------------------------------

-- The file itself lives in core.attachments and its storage bucket; this table adds
-- what marketing needs to know about it. No second storage subsystem (§0.1, §14.3).
create table discovery.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  attachment_id uuid not null references core.attachments (id) on delete cascade,
  campaign_id uuid references discovery.marketing_campaigns (id) on delete set null,
  content_id uuid references discovery.marketing_content (id) on delete set null,
  offering_id uuid references discovery.products (id) on delete set null,
  name text not null,
  asset_type text not null check (asset_type in (
    'image', 'logo', 'video', 'pdf', 'presentation', 'creative',
    'brand_material', 'document', 'other'
  )),
  alt_text text,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index marketing_assets_attachment_idx on discovery.marketing_assets (attachment_id);
create index marketing_assets_business_id_idx on discovery.marketing_assets (business_id);
create index marketing_assets_campaign_id_idx on discovery.marketing_assets (campaign_id);
create index marketing_assets_content_id_idx on discovery.marketing_assets (content_id);

-- ---------------------------------------------------------------------------
-- SEO opportunities (§16)
-- ---------------------------------------------------------------------------

-- Findings about the business's own site. The existing website crawl remains the system
-- of record for page data (§16); this table stores the *opportunity* raised from it,
-- with the evidence that raised it, so nothing here claims a fact the crawler did not
-- collect (§16.2, §61).
create table discovery.marketing_seo_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  page_url text,
  category text not null check (category in (
    'metadata', 'content_gap', 'topic_coverage', 'internal_linking', 'page_structure',
    'keyword_opportunity', 'conversion', 'ai_search_visibility', 'other'
  )),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  title text not null,
  description text,
  recommended_action text,
  -- What was actually observed, and where it came from. Required reading before anyone
  -- believes the finding (§16.3, §61).
  evidence jsonb not null default '{}'::jsonb,
  source text not null default 'crawl' check (source in ('crawl', 'manual', 'import', 'ai')),
  source_url text,
  observed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  owner_id uuid,
  resolved_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_seo_items_business_id_idx on discovery.marketing_seo_items (business_id);
create index marketing_seo_items_business_status_idx on discovery.marketing_seo_items (business_id, status);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuses the schema's existing trigger function)
-- ---------------------------------------------------------------------------

create trigger marketing_strategies_set_updated_at
  before update on discovery.marketing_strategies
  for each row execute function discovery.set_updated_at();
create trigger marketing_campaigns_set_updated_at
  before update on discovery.marketing_campaigns
  for each row execute function discovery.set_updated_at();
create trigger marketing_content_set_updated_at
  before update on discovery.marketing_content
  for each row execute function discovery.set_updated_at();
create trigger marketing_assets_set_updated_at
  before update on discovery.marketing_assets
  for each row execute function discovery.set_updated_at();
create trigger marketing_seo_items_set_updated_at
  before update on discovery.marketing_seo_items
  for each row execute function discovery.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — tenant AND licensed (CLAUDE.md non-negotiable 2)
-- ---------------------------------------------------------------------------

alter table discovery.marketing_strategies enable row level security;
alter table discovery.marketing_campaigns enable row level security;
alter table discovery.marketing_campaign_metrics enable row level security;
alter table discovery.marketing_attributions enable row level security;
alter table discovery.marketing_content enable row level security;
alter table discovery.marketing_content_versions enable row level security;
alter table discovery.marketing_assets enable row level security;
alter table discovery.marketing_seo_items enable row level security;

-- Read: a member of the business, and the business holds an active-or-grace Discovery
-- licence. Write: the same plus a write licence (grace is read-only, ADR-9) and the
-- RBAC permission for the operation.
create policy "members can view marketing strategies"
  on discovery.marketing_strategies for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
  );
create policy "marketing managers can create strategies"
  on discovery.marketing_strategies for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
create policy "marketing managers can update strategies"
  on discovery.marketing_strategies for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );

create policy "members can view marketing campaigns"
  on discovery.marketing_campaigns for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
  );
create policy "marketing managers can create campaigns"
  on discovery.marketing_campaigns for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
create policy "marketing managers can update campaigns"
  on discovery.marketing_campaigns for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );

create policy "members can view campaign metrics"
  on discovery.marketing_campaign_metrics for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
  );
create policy "marketing managers can record campaign metrics"
  on discovery.marketing_campaign_metrics for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
create policy "marketing managers can update campaign metrics"
  on discovery.marketing_campaign_metrics for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
create policy "marketing managers can delete campaign metrics"
  on discovery.marketing_campaign_metrics for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );

create policy "members can view marketing attributions"
  on discovery.marketing_attributions for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
  );
create policy "marketing managers can create attributions"
  on discovery.marketing_attributions for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
create policy "marketing managers can delete attributions"
  on discovery.marketing_attributions for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );

create policy "members can view marketing content"
  on discovery.marketing_content for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
  );
create policy "marketing managers can create content"
  on discovery.marketing_content for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
create policy "marketing managers can update content"
  on discovery.marketing_content for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );

create policy "members can view content versions"
  on discovery.marketing_content_versions for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
  );
create policy "marketing managers can create content versions"
  on discovery.marketing_content_versions for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );

create policy "members can view marketing assets"
  on discovery.marketing_assets for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
  );
create policy "marketing managers can create assets"
  on discovery.marketing_assets for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
create policy "marketing managers can update assets"
  on discovery.marketing_assets for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
create policy "marketing managers can delete assets"
  on discovery.marketing_assets for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );

create policy "members can view seo items"
  on discovery.marketing_seo_items for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('discovery'))
  );
create policy "marketing managers can create seo items"
  on discovery.marketing_seo_items for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
create policy "marketing managers can update seo items"
  on discovery.marketing_seo_items for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('discovery'))
    and core.has_permission(business_id, 'marketing.manage')
  );
