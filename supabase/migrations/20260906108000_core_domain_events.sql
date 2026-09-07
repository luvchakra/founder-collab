-- Epic 3, story D-9: core.domain_events + a core.jobs-style drain mechanism
-- (00-MASTER-PLAN.md §6, ADR-5). Mechanism 3 of the three legal ways modules talk to
-- each other: "publish now, maybe consumed later, replayed when a module is bought" --
-- direct calls can't express that, but a table plus a cron can (ADR-5's own words).
--
-- No queue infrastructure (no Redis/BullMQ/Kafka, per the co-founder-ai blueprint's
-- §23 "Background Processing" -- a DB-backed jobs record + scheduled processing, never
-- built there but described exactly this way). The reliable state-transition bookkeeping
-- (attempts, exponential backoff, when to give up, when to park) lives here as two
-- SECURITY DEFINER functions so it's crash-safe and directly testable against real
-- Postgres, the same way D-6's totals recomputation and D-7's allocation cap are --
-- rather than being reimplemented (and re-tested) as plain application-code branching
-- with nothing to check it against. The actual "what happens when this event fires"
-- dispatch -- necessarily module-specific, and no module publishes or consumes a real
-- event yet -- is the cron route's job (apps/web/app/api/cron/drain-events), which calls
-- core.record_domain_event_attempt() with the outcome once it knows one.
--
-- "no_consumer parking" (backlog's own words) means specifically: an event whose
-- `required_module` isn't licensed yet for that business is parked (status='parked'),
-- not retried and not failed -- core.replay_parked_events() is what un-parks it once the
-- module is actually licensed (wired into packages/core/src/licensing/lifecycle.ts's
-- activateLicense(), C-4). A missing handler in code for an event nobody has built a
-- consumer for yet is a different, permanent failure (nothing will ever fix that by
-- waiting) -- the cron route reports that as 'failed_permanent', not 'parked'.

create table core.domain_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  type text not null,
  required_module text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'parked', 'processed', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  published_at timestamptz not null default now(),
  processed_at timestamptz
);

create index domain_events_business_id_idx on core.domain_events (business_id);
create index domain_events_type_idx on core.domain_events (type);
-- The drain loop's own query shape: "what's due right now".
create index domain_events_due_idx on core.domain_events (next_attempt_at) where status = 'pending';
create index domain_events_parked_idx on core.domain_events (business_id, required_module) where status = 'parked';

-- Pure, atomic bookkeeping for one drain attempt's outcome. Called by the cron route
-- after it has already decided what happened -- this function does not itself decide
-- whether an event *should* succeed, only how to record that it did or didn't.
--   'processed'        -- the handler ran successfully.
--   'parked'           -- required_module isn't licensed yet; no attempts penalty.
--   'failed_retry'     -- the handler threw; back off and try again, unless this was
--                         the last attempt, in which case it becomes permanent.
--   'failed_permanent' -- nothing will ever fix this by retrying (e.g. no handler is
--                         registered for this event type at all) -- fail immediately,
--                         no backoff, no further attempts.
create function core.record_domain_event_attempt(
  p_event_id uuid,
  p_outcome text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_attempts integer;
  v_max_attempts integer;
begin
  if p_outcome not in ('processed', 'parked', 'failed_retry', 'failed_permanent') then
    raise exception 'unknown domain event outcome: %', p_outcome;
  end if;

  if p_outcome = 'processed' then
    update core.domain_events
    set status = 'processed', processed_at = now(), last_error = null
    where id = p_event_id;
  elsif p_outcome = 'parked' then
    update core.domain_events
    set status = 'parked'
    where id = p_event_id;
  elsif p_outcome = 'failed_permanent' then
    update core.domain_events
    set status = 'failed', attempts = attempts + 1, last_error = p_error
    where id = p_event_id;
  else -- failed_retry
    select attempts, max_attempts into v_attempts, v_max_attempts
    from core.domain_events where id = p_event_id;

    if v_attempts + 1 >= v_max_attempts then
      update core.domain_events
      set status = 'failed', attempts = attempts + 1, last_error = p_error
      where id = p_event_id;
    else
      -- Exponential backoff: 2, 4, 8, 16... minutes per attempt.
      update core.domain_events
      set
        status = 'pending',
        attempts = attempts + 1,
        next_attempt_at = now() + (power(2, attempts + 1) * interval '1 minute'),
        last_error = p_error
      where id = p_event_id;
    end if;
  end if;
end;
$$;

revoke execute on function core.record_domain_event_attempt(uuid, text, text) from public, anon;
grant execute on function core.record_domain_event_attempt(uuid, text, text) to authenticated;

-- Un-parks every event a business had waiting on one specific module -- called once
-- that module's license actually activates (packages/core/src/licensing/lifecycle.ts).
create function core.replay_parked_events(p_business_id uuid, p_module text)
returns integer
language plpgsql
security definer
set search_path = core
as $$
declare
  v_count integer;
begin
  update core.domain_events
  set status = 'pending', next_attempt_at = now()
  where business_id = p_business_id and required_module = p_module and status = 'parked';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function core.replay_parked_events(uuid, text) from public, anon;
grant execute on function core.replay_parked_events(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.domain_events enable row level security;

-- Members can see their own business's event log (an audit trail of what's happened)
-- and publish new events -- but never edit the drain bookkeeping columns directly.
-- Only the two SECURITY DEFINER functions above (and the cron route's admin client,
-- which bypasses RLS entirely) update status/attempts/next_attempt_at/processed_at.
create policy "members can view domain events in their businesses"
  on core.domain_events for select
  using (business_id in (select core.user_business_ids()));
create policy "members can publish domain events in their businesses"
  on core.domain_events for insert
  with check (business_id in (select core.user_business_ids()));
