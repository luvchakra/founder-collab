-- PLATFORM-P1-04.2 (Trial Configuration), PLATFORM-P1-04.3 (Grace Period) and
-- PLATFORM-P1-04.4 (Cancellation Behavior), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §26. Four settings on the existing single-row platform.billing_settings (its audit trail,
-- platform.billing_settings_events, records every change with a reason):
--
--   trial_days / trial_plan_keys / trial_entitlements -- a first subscription to an
--     eligible plan starts with a free trial; during it the business gets either the plan's
--     own modules or every module. 0 days = no trials (the default: nothing changes until
--     an operator turns trials on).
--   payment_grace_days -- how long a subscription whose payment failed keeps its modules
--     while the provider retries. null = until the provider gives up (today's behaviour).
--   feature_grace_days -- the read-only period a licence gets after its subscription ends,
--     before it locks (ADR-9). Never below 30: the public site promises a 30-day read-only
--     grace, so it may only be made longer.
--
-- Data retention after cancellation is deliberately not a setting: data is never deleted
-- because a subscription ended (CLAUDE.md non-negotiable 4).

alter table platform.billing_settings
  add column trial_days integer not null default 0 check (trial_days between 0 and 90),
  add column trial_plan_keys text[] not null default '{}',
  add column trial_entitlements text not null default 'plan' check (trial_entitlements in ('plan', 'all_modules')),
  add column payment_grace_days integer check (payment_grace_days is null or payment_grace_days between 0 and 60),
  add column feature_grace_days integer not null default 30 check (feature_grace_days between 30 and 180);

-- When a subscription last entered past_due (null when it isn't), so payment grace can be
-- measured. Written by billing/sync.ts.
alter table platform.subscriptions add column past_due_since timestamptz;

create or replace function platform.update_subscription_lifecycle_settings(
  p_trial_days integer,
  p_trial_plan_keys text[],
  p_trial_entitlements text,
  p_payment_grace_days integer,
  p_feature_grace_days integer,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before platform.billing_settings;
  v_after platform.billing_settings;
  v_unknown text;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  select k into v_unknown
  from unnest(coalesce(p_trial_plan_keys, '{}')) k
  where not exists (select 1 from platform.plans p where p.key = k)
  limit 1;
  if v_unknown is not null then
    raise exception 'Unknown plan: %', v_unknown;
  end if;

  select * into v_before from platform.billing_settings where id for update;
  update platform.billing_settings set
    trial_days = p_trial_days,
    trial_plan_keys = coalesce(p_trial_plan_keys, '{}'),
    trial_entitlements = p_trial_entitlements,
    payment_grace_days = p_payment_grace_days,
    feature_grace_days = p_feature_grace_days,
    updated_at = now(),
    updated_by = auth.uid()
  where id
  returning * into v_after;
  insert into platform.billing_settings_events (previous_value, new_value, reason, performed_by)
  values (to_jsonb(v_before) - 'id', to_jsonb(v_after) - 'id', p_reason, auth.uid());
end;
$$;

revoke execute on function platform.update_subscription_lifecycle_settings(integer, text[], text, integer, integer, text) from public, anon;
grant execute on function platform.update_subscription_lifecycle_settings(integer, text[], text, integer, integer, text) to authenticated;
