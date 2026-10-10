-- PLATFORM-P1-07.4 ("Operational Alerts", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §29): one row per alert episode -- opened when a check in
-- packages/core/src/admin/platform-health.ts crosses its threshold, kept open (last_seen_at
-- bumped) while it stays over, resolved the first run it doesn't. Platform operators are
-- emailed when an episode opens, never again for the same episode, so a daily check that
-- keeps finding the same problem doesn't repeat the email.
--
-- Control-plane data (the `platform` schema exception in CLAUDE.md non-negotiable 1): not
-- tenant data, never licence-gated. Written only by the ops-alerts cron through
-- platform.record_ops_alerts() (service_role); superadmins read it on /platform/health.

create table platform.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null check (alert_key ~ '^[a-z0-9_.]+$'),
  severity text not null check (severity in ('warning', 'critical')),
  message text not null check (btrim(message) <> ''),
  details jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Set once the opening email went out; notify_error records why it didn't (email not
  -- configured, no operator address, provider error) so the page never implies a sent email.
  notified_at timestamptz,
  notify_error text
);
create unique index ops_alerts_one_open_per_key_idx on platform.ops_alerts (alert_key) where resolved_at is null;
create index ops_alerts_opened_idx on platform.ops_alerts (opened_at desc);

alter table platform.ops_alerts enable row level security;
create policy "superadmins can read ops alerts" on platform.ops_alerts
  for select to authenticated using (platform.is_superadmin());
revoke all on platform.ops_alerts from anon, authenticated;
grant select on platform.ops_alerts to authenticated;
grant all on platform.ops_alerts to service_role;

-- Takes the alerts firing right now ([{key, severity, message, details}]), opens an episode
-- for each key with none open, refreshes the open ones, resolves open episodes whose key is
-- no longer firing, and returns the episodes it just opened (the ones to email about).
-- Safe to run twice: the partial unique index means a key has at most one open episode.
create or replace function platform.record_ops_alerts(p_alerts jsonb)
returns table (id uuid, alert_key text, severity text, message text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if jsonb_typeof(p_alerts) is distinct from 'array' then
    raise exception 'p_alerts must be a JSON array';
  end if;

  update platform.ops_alerts a
  set resolved_at = now()
  where a.resolved_at is null
    and not exists (select 1 from jsonb_array_elements(p_alerts) e where e ->> 'key' = a.alert_key);

  update platform.ops_alerts a
  set last_seen_at = now(),
      severity = e ->> 'severity',
      message = e ->> 'message',
      details = coalesce(e -> 'details', '{}'::jsonb)
  from jsonb_array_elements(p_alerts) e
  where a.resolved_at is null and a.alert_key = e ->> 'key';

  return query
  insert into platform.ops_alerts as a (alert_key, severity, message, details)
  select e ->> 'key', e ->> 'severity', e ->> 'message', coalesce(e -> 'details', '{}'::jsonb)
  from jsonb_array_elements(p_alerts) e
  where not exists (
    select 1 from platform.ops_alerts o where o.alert_key = e ->> 'key' and o.resolved_at is null
  )
  on conflict (alert_key) where resolved_at is null do nothing
  returning a.id, a.alert_key, a.severity, a.message;
end;
$$;

revoke execute on function platform.record_ops_alerts(jsonb) from public, anon, authenticated;
grant execute on function platform.record_ops_alerts(jsonb) to service_role;

-- Records the outcome of the opening email for one episode. Service role only.
create or replace function platform.mark_ops_alert_notified(p_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update platform.ops_alerts
  set notified_at = case when p_error is null then now() else notified_at end,
      notify_error = p_error
  where id = p_id;
$$;

revoke execute on function platform.mark_ops_alert_notified(uuid, text) from public, anon, authenticated;
grant execute on function platform.mark_ops_alert_notified(uuid, text) to service_role;
