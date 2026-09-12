-- DISC-OFFER-P0-09.2 "Website Crawl & Content Discovery" -- one row per page the crawl
-- (lib/ai/website-crawl.ts) actually attempted for one onboarding run: the homepage plus
-- whichever internal pages (About/Products/Services/Solutions/Industries/Use Cases/
-- Pricing/Case Studies/Customers/Resources/FAQ/Contact) the crawl plan chose and
-- robots.txt allowed. "Store source URL and retrieval timestamp" needs a real, queryable
-- row per page, not just a summary count -- a page skipped by robots/dedup/the page cap
-- is never attempted, so it's never inserted here either (nothing to record).
--
-- Child of discovery.website_onboarding_runs, same business-scoped tenancy chain (no
-- separate business_id/RLS check needed -- see the policies below, which read through the
-- parent run exactly like every other "child of a tenant-scoped row" table in this
-- schema, e.g. discovery.signal_correlations reading through discovery.prospects).
create table discovery.website_onboarding_pages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references discovery.website_onboarding_runs (id) on delete cascade,
  url text not null,
  category text not null check (category in (
    'home', 'about', 'products', 'services', 'solutions', 'industries', 'use_cases',
    'pricing', 'case_studies', 'customers', 'resources', 'faq', 'contact', 'other'
  )),
  status text not null check (status in ('succeeded', 'failed')),
  error text,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index website_onboarding_pages_run_id_idx on discovery.website_onboarding_pages (run_id);

alter table discovery.website_onboarding_pages enable row level security;

-- Append-only, same as the parent run: a crawled page is a durable record of what was
-- fetched and when, never edited or deleted in place (a retry crawls into a brand-new run
-- and a brand-new set of page rows instead).
create policy "members can view website onboarding pages in their businesses"
  on discovery.website_onboarding_pages for select
  using (run_id in (
    select id from discovery.website_onboarding_runs
    where business_id in (select core.user_business_ids())
  ));
create policy "members can create website onboarding pages in their businesses"
  on discovery.website_onboarding_pages for insert
  with check (run_id in (
    select id from discovery.website_onboarding_runs
    where business_id in (select core.user_business_ids())
  ));
