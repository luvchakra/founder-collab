-- PLATFORM-P1-04.2/04.3/04.4 ("Subscription Lifecycle") and PLATFORM-P1-05.1/05.3/05.4
-- ("Platform Billing Configuration"), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §26-§27 -- the parts subscription billing (docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md,
-- 20260926130000_platform_billing.sql) did not already build.
--
-- Already built there, and deliberately NOT duplicated here:
--   * PLATFORM-P1-04.1 plan change rules -- billing_settings.upgrade/downgrade_timing,
--     proration_enabled (BILL-29);
--   * PLATFORM-P1-05.2 billing provider and environment -- platform.billing_providers
--     (enabled, test/live environment, priority, secrets) (BILL-06);
--   * per-provider currencies -- billing_providers.supported_currencies.
--
-- Added here, all on the existing platform.billing_settings singleton (one "billing
-- settings" concept, one history table -- billing_settings_events -- and one place in
-- Configuration History, rather than a parallel settings table):
--
--   04.2 Trial: trial_days (0 = no trials), trial_plan_ids (eligible plans; empty = none),
--        trial_module_keys (the trial's entitlements; null = the plan's full modules).
--   04.3 Grace: payment_grace_days (a past_due subscription keeps its modules this long
--        after the payment first failed -- tracked by the new subscriptions.past_due_since),
--        feature_grace_days (the read-only licence grace after a subscription ends; the
--        ADR-9 30 days is the floor, never shortened), locked_data_retention_days (how long
--        data is kept after the grace ends; null = indefinitely).
--   04.4 Cancellation: cancel -> grace -> locked, never deletion. Nothing in the platform
--        deletes customer data when a subscription ends (licences move active -> grace ->
--        expired and rows stay, CLAUDE.md non-negotiable #4); locked_data_retention_days is
--        a customer-facing retention commitment with a 365-day floor, not a purge schedule
--        -- no job deletes anything after it.
--   05.1 Currency: supported_currencies -- the platform-wide list of currencies WonderArk
--        bills in; checkout refuses any other, whatever a provider could take.
--   05.3 Subscription tax: WonderArk's OWN tax on what it charges businesses (tax_mode,
--        tax_label, tax_rate_percent, seller_tax_id, tax_country). Deliberately kept here in
--        `platform`, never in `gst` -- a customer's own business-tax compliance
--        (gst.tax_rules, compliance packs) is a different thing and is never read or
--        written by billing. 'provider' (the default, today's behaviour) means the payment
--        provider calculates tax on its payment page.
--   05.4 Price versioning: subscriptions.plan_price_id records the exact price row a
--        subscription was created on, and a recorded price can no longer be edited in place
--        (trigger below) -- a new price is a new row, the old one is deactivated, so every
--        historical subscription keeps resolving to the price it was sold at.

alter table platform.billing_settings
  add column trial_days integer not null default 0 check (trial_days between 0 and 90),
  add column trial_plan_ids uuid[] not null default '{}',
  add column trial_module_keys text[],
  add column payment_grace_days integer not null default 7 check (payment_grace_days between 0 and 60),
  add column feature_grace_days integer not null default 30 check (feature_grace_days between 30 and 365),
  add column locked_data_retention_days integer check (locked_data_retention_days is null or locked_data_retention_days >= 365),
  add column supported_currencies text[] not null default array['INR', 'USD', 'EUR', 'GBP'],
  add column tax_mode text not null default 'provider' check (tax_mode in ('provider', 'inclusive', 'exclusive', 'none')),
  add column tax_label text check (tax_label is null or char_length(tax_label) between 1 and 40),
  add column tax_rate_percent numeric(5, 2) check (tax_rate_percent is null or tax_rate_percent between 0 and 100),
  add column seller_tax_id text check (seller_tax_id is null or char_length(seller_tax_id) between 1 and 40),
  add column tax_country text check (tax_country is null or tax_country ~ '^[A-Z]{2}$'),
  add constraint billing_settings_tax_rate_required check (
    tax_mode not in ('inclusive', 'exclusive') or (tax_rate_percent is not null and tax_label is not null)
  ),
  add constraint billing_settings_currencies_iso check (
    cardinality(supported_currencies) > 0 and array_to_string(supported_currencies, ',') ~ '^[A-Z]{3}(,[A-Z]{3})*$'
  );

create function platform.update_subscription_lifecycle(
  p_trial_days integer,
  p_trial_plan_ids uuid[],
  p_trial_module_keys text[],
  p_payment_grace_days integer,
  p_feature_grace_days integer,
  p_locked_data_retention_days integer,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before platform.billing_settings;
  v_after platform.billing_settings;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  if exists (select 1 from unnest(coalesce(p_trial_plan_ids, '{}')) as t(plan_id) where not exists (select 1 from platform.plans p where p.id = t.plan_id)) then
    raise exception 'Unknown trial plan.';
  end if;
  if exists (select 1 from unnest(coalesce(p_trial_module_keys, '{}')) as t(module_key) where not exists (select 1 from core.modules m where m.key = t.module_key)) then
    raise exception 'Unknown trial module.';
  end if;

  select * into v_before from platform.billing_settings where id for update;
  update platform.billing_settings set
    trial_days = p_trial_days,
    trial_plan_ids = coalesce(p_trial_plan_ids, '{}'),
    trial_module_keys = p_trial_module_keys,
    payment_grace_days = p_payment_grace_days,
    feature_grace_days = p_feature_grace_days,
    locked_data_retention_days = p_locked_data_retention_days,
    updated_at = now(),
    updated_by = auth.uid()
  where id
  returning * into v_after;
  insert into platform.billing_settings_events (previous_value, new_value, reason, performed_by)
  values (to_jsonb(v_before) - 'id', to_jsonb(v_after) - 'id', btrim(p_reason), auth.uid());
end;
$$;

create function platform.update_subscription_billing_config(
  p_supported_currencies text[],
  p_tax_mode text,
  p_tax_label text,
  p_tax_rate_percent numeric,
  p_seller_tax_id text,
  p_tax_country text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before platform.billing_settings;
  v_after platform.billing_settings;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;

  select * into v_before from platform.billing_settings where id for update;
  update platform.billing_settings set
    supported_currencies = coalesce((select array_agg(distinct upper(btrim(c)) order by upper(btrim(c))) from unnest(p_supported_currencies) c where btrim(c) <> ''), '{}'),
    tax_mode = p_tax_mode,
    tax_label = nullif(btrim(p_tax_label), ''),
    tax_rate_percent = p_tax_rate_percent,
    seller_tax_id = nullif(btrim(p_seller_tax_id), ''),
    tax_country = nullif(upper(btrim(p_tax_country)), ''),
    updated_at = now(),
    updated_by = auth.uid()
  where id
  returning * into v_after;
  insert into platform.billing_settings_events (previous_value, new_value, reason, performed_by)
  values (to_jsonb(v_before) - 'id', to_jsonb(v_after) - 'id', btrim(p_reason), auth.uid());
end;
$$;

revoke execute on function platform.update_subscription_lifecycle(integer, uuid[], text[], integer, integer, integer, text) from public, anon;
revoke execute on function platform.update_subscription_billing_config(text[], text, text, numeric, text, text, text) from public, anon;
grant execute on function platform.update_subscription_lifecycle(integer, uuid[], text[], integer, integer, integer, text) to authenticated;
grant execute on function platform.update_subscription_billing_config(text[], text, text, numeric, text, text, text) to authenticated;

-- 04.3 payment grace + 05.4 price versioning on the subscription itself.
alter table platform.subscriptions
  add column past_due_since timestamptz,
  add column plan_price_id uuid references platform.plan_prices (id);

create index subscriptions_plan_price_idx on platform.subscriptions (plan_price_id);
create index subscriptions_past_due_idx on platform.subscriptions (past_due_since) where status = 'past_due';
create index subscriptions_trial_end_idx on platform.subscriptions (trial_end) where status = 'trialing';

-- 05.4: what a price row *is* never changes after it is recorded. Only its active flag,
-- the informational provider product id and the updated_* stamps may move.
create function platform.plan_prices_immutable()
returns trigger
language plpgsql
set search_path = platform
as $$
begin
  if new.plan_id is distinct from old.plan_id
    or new.provider is distinct from old.provider
    or new.environment is distinct from old.environment
    or new.currency is distinct from old.currency
    or new.billing_interval is distinct from old.billing_interval
    or new.amount is distinct from old.amount
    or new.provider_price_id is distinct from old.provider_price_id then
    raise exception 'A recorded price cannot be changed. Record a new price instead -- existing subscriptions keep the price they were sold at.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger plan_prices_immutable
  before update on platform.plan_prices
  for each row execute function platform.plan_prices_immutable();
