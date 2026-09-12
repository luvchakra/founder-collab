-- DISC-OFFER-P0-09.1 "Website URL Business Onboarding" -- Phase E's autonomous
-- website-to-offering pipeline starts here. A business exists before any offering does
-- (offerings/workspaces are created per-product, which doesn't happen until DISC-OFFER-
-- P0-09.3/09.4 turn a reviewed extraction into real rows), so this run is business_id-
-- scoped like `discovery.products` itself -- not workspace-scoped like almost everything
-- else in this schema.
--
-- A real, persisted row (not just component state) is what makes "Website inspection
-- runs asynchronously. Progress is visible. Errors are recoverable." actually true: the
-- business is created immediately with a placeholder name, a `pending` run is recorded
-- alongside it, and the AI extraction itself happens afterward (client-triggered, via a
-- streaming route handler -- see apps/web's own discover-products/route.ts for the exact
-- established shape this reuses) so business creation is never blocked on a website
-- fetch/AI call. A page reload sees the same row and can resume watching it or retry it,
-- rather than losing all trace of what happened.
create table discovery.website_onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  website text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  -- Structured WebsiteBusinessProfile (lib/ai/schemas.ts) -- every field carries its own
  -- explicit/inferred/unknown status alongside its value, per the story's own "every
  -- extracted item must distinguish explicitly stated / AI interpretation / unknown".
  -- Null until the run succeeds.
  profile jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index website_onboarding_runs_business_id_idx on discovery.website_onboarding_runs (business_id);

create trigger website_onboarding_runs_set_updated_at
  before update on discovery.website_onboarding_runs
  for each row execute function discovery.set_updated_at();

alter table discovery.website_onboarding_runs enable row level security;

-- Same business_id -> core.user_business_ids() shape discovery.products itself uses
-- (this table has no workspace_id to key off, same reasoning as ai_provider_credentials
-- keying off account_id instead of workspace_id). No delete policy: a run is a durable
-- record of what happened, the same append-style precedent `ai_runs`/`prospect_scores`
-- already established elsewhere in this schema -- a failed run stays visible rather than
-- disappearing, and "retry" creates a fresh row instead of erasing the failed one.
create policy "members can view website onboarding runs in their businesses"
  on discovery.website_onboarding_runs for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create website onboarding runs in their businesses"
  on discovery.website_onboarding_runs for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update website onboarding runs in their businesses"
  on discovery.website_onboarding_runs for update
  using (business_id in (select core.user_business_ids()));
