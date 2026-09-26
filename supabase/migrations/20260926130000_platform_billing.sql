-- BILL-03 / BILL-06 / BILL-07 / BILL-14 -- subscription billing tables
-- (docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md §17-§21, §40-§43, §51, §66-§68).
--
-- WonderArk owns the commercial truth; Razorpay and Stripe collect and report money.
-- platform.plans stays the canonical plan catalogue and core.licenses the only
-- authorization mechanism -- nothing here grants access by itself. Everything below is
-- platform control-plane data, so it lives in `platform`, and every table is either
-- invisible to customers or readable only through their own business.
--
-- Deliberately NOT created (§67): no parallel licence table (core.licenses carries the
-- subscription link, 20260926130100), and no reuse of core.payments -- that is a
-- tenant's own receivables ledger (a business's customers paying it), feeding its GST and
-- accounting; a subscription payment is money the business pays WonderArk.

-- ---------------------------------------------------------------------------------------
-- Provider configuration (§40-§43). One row per provider. Secrets are encrypted by the
-- application (AES-256-GCM, packages/core/src/crypto/api-key.ts -- the same helper and key
-- as platform AI provider keys) and the table is readable by the service role only;
-- superadmins see a masked status through billing_provider_status().
-- ---------------------------------------------------------------------------------------

create table platform.billing_providers (
  provider text primary key check (provider in ('razorpay', 'stripe')),
  enabled boolean not null default false,
  environment text not null default 'test' check (environment in ('test', 'live')),
  -- Lower is preferred when two enabled providers can both take a checkout (§15, §57).
  priority integer not null default 100,
  supported_currencies text[] not null default '{}',
  -- Empty = any country.
  supported_countries text[] not null default '{}',
  -- Razorpay Key ID / Stripe publishable key -- public by design (§65), still admin-set.
  public_key text,
  account_id text,
  encrypted_secret_key text,
  secret_key_fingerprint text,
  encrypted_webhook_secret text,
  webhook_secret_fingerprint text,
  last_webhook_at timestamptz,
  last_webhook_failure_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into platform.billing_providers (provider, supported_currencies, priority)
values ('razorpay', array['INR'], 10), ('stripe', array['USD', 'EUR', 'GBP'], 20)
on conflict (provider) do nothing;

alter table platform.billing_providers enable row level security;
grant all on platform.billing_providers to service_role;

create table platform.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null references platform.billing_providers (provider),
  action text not null check (action in ('config_updated', 'secrets_set', 'secrets_cleared')),
  -- Snapshots carry fingerprints and non-secret settings only -- never a secret (§43).
  previous_value jsonb,
  new_value jsonb,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid,
  performed_at timestamptz not null default now()
);
create index billing_provider_events_provider_idx on platform.billing_provider_events (provider, performed_at desc);
alter table platform.billing_provider_events enable row level security;
create policy "superadmins can view billing provider events" on platform.billing_provider_events
  for select to authenticated using (platform.is_superadmin());
grant select on platform.billing_provider_events to authenticated;
grant all on platform.billing_provider_events to service_role;

create or replace function platform.billing_provider_snapshot(p platform.billing_providers)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'enabled', p.enabled,
    'environment', p.environment,
    'priority', p.priority,
    'supported_currencies', p.supported_currencies,
    'supported_countries', p.supported_countries,
    'public_key', p.public_key,
    'account_id', p.account_id,
    'secret_key_fingerprint', p.secret_key_fingerprint,
    'webhook_secret_fingerprint', p.webhook_secret_fingerprint
  );
$$;

-- Masked status for the admin UI: whether each secret is set (and its fingerprint), never
-- the ciphertext.
create or replace function platform.billing_provider_status()
returns table (
  provider text,
  enabled boolean,
  environment text,
  priority integer,
  supported_currencies text[],
  supported_countries text[],
  public_key text,
  account_id text,
  secret_key_configured boolean,
  secret_key_fingerprint text,
  webhook_secret_configured boolean,
  webhook_secret_fingerprint text,
  last_webhook_at timestamptz,
  last_webhook_failure_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = platform
as $$
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
    select p.provider, p.enabled, p.environment, p.priority, p.supported_currencies, p.supported_countries,
           p.public_key, p.account_id, p.encrypted_secret_key is not null, p.secret_key_fingerprint,
           p.encrypted_webhook_secret is not null, p.webhook_secret_fingerprint,
           p.last_webhook_at, p.last_webhook_failure_at, p.updated_at
    from platform.billing_providers p
    order by p.priority, p.provider;
end;
$$;

create or replace function platform.update_billing_provider(
  p_provider text,
  p_enabled boolean,
  p_environment text,
  p_priority integer,
  p_supported_currencies text[],
  p_supported_countries text[],
  p_public_key text,
  p_account_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before platform.billing_providers;
  v_after platform.billing_providers;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  select * into v_before from platform.billing_providers where provider = p_provider for update;
  if not found then
    raise exception 'Unknown billing provider %', p_provider;
  end if;

  update platform.billing_providers set
    enabled = p_enabled,
    environment = p_environment,
    priority = p_priority,
    supported_currencies = coalesce((select array_agg(distinct upper(btrim(c))) from unnest(p_supported_currencies) c where btrim(c) <> ''), '{}'),
    supported_countries = coalesce((select array_agg(distinct upper(btrim(c))) from unnest(p_supported_countries) c where btrim(c) <> ''), '{}'),
    public_key = nullif(btrim(p_public_key), ''),
    account_id = nullif(btrim(p_account_id), ''),
    -- Never mix test and live credentials (§42): moving environments drops the stored
    -- secrets, so the other environment's keys must be entered before anything works.
    encrypted_secret_key = case when p_environment <> v_before.environment then null else encrypted_secret_key end,
    secret_key_fingerprint = case when p_environment <> v_before.environment then null else secret_key_fingerprint end,
    encrypted_webhook_secret = case when p_environment <> v_before.environment then null else encrypted_webhook_secret end,
    webhook_secret_fingerprint = case when p_environment <> v_before.environment then null else webhook_secret_fingerprint end,
    updated_at = now(),
    updated_by = auth.uid()
  where provider = p_provider
  returning * into v_after;

  insert into platform.billing_provider_events (provider, action, previous_value, new_value, reason, performed_by)
  values (p_provider, 'config_updated', platform.billing_provider_snapshot(v_before), platform.billing_provider_snapshot(v_after), p_reason, auth.uid());
end;
$$;

-- Secrets arrive already encrypted by the application; null leaves a secret unchanged.
-- Neither the old nor the new secret is ever written to the events table (§43).
create or replace function platform.set_billing_provider_secrets(
  p_provider text,
  p_encrypted_secret_key text,
  p_secret_key_fingerprint text,
  p_encrypted_webhook_secret text,
  p_webhook_secret_fingerprint text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before platform.billing_providers;
  v_after platform.billing_providers;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  select * into v_before from platform.billing_providers where provider = p_provider for update;
  if not found then
    raise exception 'Unknown billing provider %', p_provider;
  end if;

  update platform.billing_providers set
    encrypted_secret_key = coalesce(p_encrypted_secret_key, encrypted_secret_key),
    secret_key_fingerprint = case when p_encrypted_secret_key is not null then p_secret_key_fingerprint else secret_key_fingerprint end,
    encrypted_webhook_secret = coalesce(p_encrypted_webhook_secret, encrypted_webhook_secret),
    webhook_secret_fingerprint = case when p_encrypted_webhook_secret is not null then p_webhook_secret_fingerprint else webhook_secret_fingerprint end,
    updated_at = now(),
    updated_by = auth.uid()
  where provider = p_provider
  returning * into v_after;

  insert into platform.billing_provider_events (provider, action, previous_value, new_value, reason, performed_by)
  values (p_provider, 'secrets_set', platform.billing_provider_snapshot(v_before), platform.billing_provider_snapshot(v_after), p_reason, auth.uid());
end;
$$;

revoke execute on function platform.billing_provider_status() from public, anon;
revoke execute on function platform.update_billing_provider(text, boolean, text, integer, text[], text[], text, text, text) from public, anon;
revoke execute on function platform.set_billing_provider_secrets(text, text, text, text, text, text) from public, anon;
grant execute on function platform.billing_provider_status() to authenticated;
grant execute on function platform.update_billing_provider(text, boolean, text, integer, text[], text[], text, text, text) to authenticated;
grant execute on function platform.set_billing_provider_secrets(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Billing policy (§54): when upgrades and downgrades take effect, and whether providers
-- prorate. Defaults favour predictable next-renewal downgrades.
-- ---------------------------------------------------------------------------------------

create table platform.billing_settings (
  id boolean primary key default true check (id),
  upgrade_timing text not null default 'immediate' check (upgrade_timing in ('immediate', 'next_renewal')),
  downgrade_timing text not null default 'next_renewal' check (downgrade_timing in ('immediate', 'next_renewal')),
  proration_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into platform.billing_settings (id) values (true) on conflict (id) do nothing;
alter table platform.billing_settings enable row level security;
-- Any signed-in user may read the policy -- the change-plan screen tells a customer when a
-- change takes effect.
create policy "signed-in users can read billing policy" on platform.billing_settings
  for select to authenticated using (true);
grant select on platform.billing_settings to authenticated;
grant all on platform.billing_settings to service_role;

create table platform.billing_settings_events (
  id uuid primary key default gen_random_uuid(),
  previous_value jsonb,
  new_value jsonb,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid,
  performed_at timestamptz not null default now()
);
alter table platform.billing_settings_events enable row level security;
create policy "superadmins can view billing settings events" on platform.billing_settings_events
  for select to authenticated using (platform.is_superadmin());
grant select on platform.billing_settings_events to authenticated;
grant all on platform.billing_settings_events to service_role;

create or replace function platform.update_billing_settings(
  p_upgrade_timing text,
  p_downgrade_timing text,
  p_proration_enabled boolean,
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
    upgrade_timing = p_upgrade_timing,
    downgrade_timing = p_downgrade_timing,
    proration_enabled = p_proration_enabled,
    updated_at = now(),
    updated_by = auth.uid()
  where id
  returning * into v_after;
  insert into platform.billing_settings_events (previous_value, new_value, reason, performed_by)
  values (to_jsonb(v_before) - 'id', to_jsonb(v_after) - 'id', p_reason, auth.uid());
end;
$$;
revoke execute on function platform.update_billing_settings(text, text, boolean, text) from public, anon;
grant execute on function platform.update_billing_settings(text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Plan prices (§17): which provider price bills a plan, per currency and interval. The
-- admin creates prices at the provider and records their ids here -- never created on the
-- fly at checkout (§16). Readable by any signed-in user (the plan picker shows the
-- amounts); written by superadmins, audited by trigger into platform.audit_log.
-- ---------------------------------------------------------------------------------------

create table platform.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references platform.plans (id) on delete cascade,
  provider text not null references platform.billing_providers (provider),
  environment text not null check (environment in ('test', 'live')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  -- What the provider charges each interval, in major units (e.g. 2999.00 INR).
  amount numeric(14, 2) not null check (amount >= 0),
  provider_product_id text,
  provider_price_id text not null check (btrim(provider_price_id) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index plan_prices_provider_price_idx on platform.plan_prices (provider, environment, provider_price_id);
create unique index plan_prices_one_active_idx on platform.plan_prices (plan_id, provider, environment, currency, billing_interval) where active;
create index plan_prices_plan_idx on platform.plan_prices (plan_id);

alter table platform.plan_prices enable row level security;
create policy "signed-in users can read plan prices" on platform.plan_prices
  for select to authenticated using (true);
create policy "superadmins can insert plan prices" on platform.plan_prices
  for insert to authenticated with check (platform.is_superadmin());
create policy "superadmins can update plan prices" on platform.plan_prices
  for update to authenticated using (platform.is_superadmin()) with check (platform.is_superadmin());
grant select, insert, update on platform.plan_prices to authenticated;
grant all on platform.plan_prices to service_role;

create or replace function platform.log_plan_price_audit()
returns trigger
language plpgsql
security definer
set search_path = platform
as $$
begin
  perform platform.write_platform_audit_log(
    auth.uid(),
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    'plan_price',
    new.id::text,
    'high',
    null,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;
create trigger plan_prices_audit
  after insert or update on platform.plan_prices
  for each row execute function platform.log_plan_price_audit();

-- ---------------------------------------------------------------------------------------
-- Billing customers (§18) -- a business's customer record at a provider. Provider ids only;
-- never card numbers, CVVs or bank credentials.
-- ---------------------------------------------------------------------------------------

create table platform.billing_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  provider text not null references platform.billing_providers (provider),
  environment text not null check (environment in ('test', 'live')),
  provider_customer_id text not null,
  email text,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index billing_customers_provider_idx on platform.billing_customers (provider, environment, provider_customer_id);
create unique index billing_customers_business_idx on platform.billing_customers (business_id, provider, environment);
alter table platform.billing_customers enable row level security;
create policy "superadmins can view billing customers" on platform.billing_customers
  for select to authenticated using (platform.is_superadmin());
grant select on platform.billing_customers to authenticated;
grant all on platform.billing_customers to service_role;

-- ---------------------------------------------------------------------------------------
-- Subscriptions (§19, §50, §59) -- WonderArk's own record of a business's plan
-- subscription, in WonderArk's normalized states; the provider's raw status is kept
-- beside it (provider_status), never copied into `status` unmapped. A free plan is a
-- subscription with provider 'internal' (§12). One live subscription per business.
-- ---------------------------------------------------------------------------------------

create table platform.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  plan_id uuid not null references platform.plans (id),
  provider text not null check (provider in ('razorpay', 'stripe', 'internal')),
  environment text not null default 'live' check (environment in ('test', 'live')),
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'incomplete' check (status in (
    'incomplete', 'trialing', 'active', 'past_due', 'paused', 'cancel_scheduled', 'cancelled', 'unpaid', 'expired'
  )),
  provider_status text,
  billing_interval text check (billing_interval in ('month', 'year')),
  currency text,
  amount numeric(14, 2),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  -- A downgrade scheduled for the next renewal (§10): the plan the subscription moves to,
  -- and when.
  pending_plan_id uuid references platform.plans (id),
  pending_change_at timestamptz,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscriptions_provider_idx on platform.subscriptions (provider, environment, provider_subscription_id)
  where provider_subscription_id is not null;
create unique index subscriptions_one_live_per_business_idx on platform.subscriptions (business_id)
  where status in ('trialing', 'active', 'past_due', 'paused', 'cancel_scheduled', 'unpaid');
create index subscriptions_business_idx on platform.subscriptions (business_id, created_at desc);
create index subscriptions_plan_idx on platform.subscriptions (plan_id);
create index subscriptions_status_idx on platform.subscriptions (status);

alter table platform.subscriptions enable row level security;
-- Every member of a business may see which plan it is on; only billing (service role)
-- writes.
create policy "members can view their business subscription" on platform.subscriptions
  for select to authenticated using (business_id in (select core.user_business_ids()) or platform.is_superadmin());
grant select on platform.subscriptions to authenticated;
grant all on platform.subscriptions to service_role;

-- ---------------------------------------------------------------------------------------
-- Payments (§20, §55, §80) -- money a business paid WonderArk for its subscription.
-- Readable by the business's account owners and admins (the people who manage billing).
-- ---------------------------------------------------------------------------------------

create table platform.billing_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  subscription_id uuid references platform.subscriptions (id) on delete set null,
  provider text not null check (provider in ('razorpay', 'stripe')),
  environment text not null check (environment in ('test', 'live')),
  provider_payment_id text,
  provider_invoice_id text,
  provider_order_id text,
  invoice_number text,
  description text,
  amount numeric(14, 2) not null,
  tax_amount numeric(14, 2),
  currency text not null,
  status text not null check (status in (
    'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'disputed', 'chargeback'
  )),
  payment_method_type text,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  failure_message_safe text,
  refunded_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index billing_payments_provider_payment_idx on platform.billing_payments (provider, environment, provider_payment_id)
  where provider_payment_id is not null;
create unique index billing_payments_provider_invoice_idx on platform.billing_payments (provider, environment, provider_invoice_id)
  where provider_invoice_id is not null and provider_payment_id is null;
create index billing_payments_business_idx on platform.billing_payments (business_id, created_at desc);
create index billing_payments_subscription_idx on platform.billing_payments (subscription_id);

alter table platform.billing_payments enable row level security;
create policy "account admins can view their business payments" on platform.billing_payments
  for select to authenticated using (
    business_id in (select b.id from core.businesses b where b.account_id in (select core.user_admin_account_ids()))
    or platform.is_superadmin()
  );
grant select on platform.billing_payments to authenticated;
grant all on platform.billing_payments to service_role;

-- ---------------------------------------------------------------------------------------
-- Webhook events (§21, §22, §53) -- every verified provider event, once. The unique
-- (provider, environment, provider_event_id) is what makes a redelivered webhook a no-op.
-- `payload` is the provider's event with nothing secret in it (events carry no
-- credentials), kept so a failed event can be retried internally (§96).
-- ---------------------------------------------------------------------------------------

create table platform.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('razorpay', 'stripe')),
  environment text not null check (environment in ('test', 'live')),
  provider_event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received' check (processing_status in (
    'received', 'processing', 'processed', 'unhandled', 'failed'
  )),
  attempt_count integer not null default 0,
  payload_hash text not null,
  payload jsonb not null,
  business_id uuid references core.businesses (id) on delete set null,
  subscription_id uuid references platform.subscriptions (id) on delete set null,
  payment_id uuid references platform.billing_payments (id) on delete set null,
  error_code text,
  error_message_safe text,
  created_at timestamptz not null default now()
);
create unique index billing_events_provider_event_idx on platform.billing_events (provider, environment, provider_event_id);
create index billing_events_status_idx on platform.billing_events (processing_status, received_at);
create index billing_events_received_idx on platform.billing_events (received_at desc);
create index billing_events_subscription_idx on platform.billing_events (subscription_id);
create index billing_events_business_idx on platform.billing_events (business_id);
create index billing_events_payment_idx on platform.billing_events (payment_id);

alter table platform.billing_events enable row level security;
create policy "superadmins can view billing events" on platform.billing_events
  for select to authenticated using (platform.is_superadmin());
grant select on platform.billing_events to authenticated;
grant all on platform.billing_events to service_role;

-- ---------------------------------------------------------------------------------------
-- Checkout sessions (§51, §52) -- one per checkout attempt, with an internal expiry. The
-- unique (business_id, idempotency_key) means two tabs clicking "Choose Pro" at once get
-- the same session, not two provider subscriptions.
-- ---------------------------------------------------------------------------------------

create table platform.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  plan_id uuid not null references platform.plans (id),
  plan_price_id uuid references platform.plan_prices (id),
  provider text not null check (provider in ('razorpay', 'stripe', 'internal')),
  environment text not null default 'live' check (environment in ('test', 'live')),
  idempotency_key text not null,
  provider_checkout_id text,
  provider_subscription_id text,
  subscription_id uuid references platform.subscriptions (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'completed', 'expired', 'failed', 'cancelled')),
  requested_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  completed_at timestamptz
);
create unique index checkout_sessions_idempotency_idx on platform.checkout_sessions (business_id, idempotency_key);
create index checkout_sessions_plan_idx on platform.checkout_sessions (plan_id);
create index checkout_sessions_price_idx on platform.checkout_sessions (plan_price_id);
create index checkout_sessions_subscription_idx on platform.checkout_sessions (subscription_id);

alter table platform.checkout_sessions enable row level security;
create policy "requesters can view their checkout sessions" on platform.checkout_sessions
  for select to authenticated using (
    (requested_by = auth.uid() and business_id in (select core.user_business_ids())) or platform.is_superadmin()
  );
grant select on platform.checkout_sessions to authenticated;
grant all on platform.checkout_sessions to service_role;
