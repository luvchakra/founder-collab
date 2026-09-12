-- DISC-OFFER-P0-09.3 "AI Offering Extraction" -- one row per proposed commercial
-- Offering the AI extraction step identified from one onboarding run's own crawled
-- website findings (lib/ai/extract-business-offerings.ts). Not yet a real
-- discovery.products row -- DISC-OFFER-P0-09.4 "Offering Review Before Activation" is
-- what turns a founder-reviewed subset of these into real Offering/workspace rows; this
-- table only ever holds the AI's own proposals.
--
-- Child of discovery.website_onboarding_runs, same read-through-the-parent-run tenancy
-- pattern discovery.website_onboarding_pages (DISC-OFFER-P0-09.2) already established --
-- no separate business_id column needed on this table either.
create table discovery.website_onboarding_offering_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references discovery.website_onboarding_runs (id) on delete cascade,
  name text not null,
  description text not null default '',
  offering_type text check (offering_type in (
    'product', 'service', 'subscription', 'consulting', 'professional_service',
    'maintenance', 'training', 'package', 'solution', 'other'
  )),
  problem_solved text,
  target_customer text,
  target_industry text,
  value_proposition text,
  evidence text not null default '',
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  source_pages text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index website_onboarding_offering_candidates_run_id_idx
  on discovery.website_onboarding_offering_candidates (run_id);

alter table discovery.website_onboarding_offering_candidates enable row level security;

-- Insert/select only, same as website_onboarding_pages -- DISC-OFFER-P0-09.4's own
-- "edit, rename, merge, remove" review actions are that story's own scope to add (its
-- own migration, once it decides exactly what an edit/merge/remove operation writes);
-- this story only ever proposes and displays, so no update/delete policy exists yet
-- (CLAUDE.md dev principle: never implement speculative functionality ahead of the
-- story that actually needs it).
create policy "members can view website onboarding offering candidates in their businesses"
  on discovery.website_onboarding_offering_candidates for select
  using (run_id in (
    select id from discovery.website_onboarding_runs
    where business_id in (select core.user_business_ids())
  ));
create policy "members can create website onboarding offering candidates in their businesses"
  on discovery.website_onboarding_offering_candidates for insert
  with check (run_id in (
    select id from discovery.website_onboarding_runs
    where business_id in (select core.user_business_ids())
  ));
