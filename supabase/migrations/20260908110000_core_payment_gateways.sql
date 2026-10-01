-- Razorpay + Stripe integration. Two distinct money flows share one gateway layer:
--
-- A. Platform billing -- a business pays CoFounderAI for module licenses.
--    core.billing_prices maps (module, provider, currency, interval) to the provider's
--    own price/plan id; core.subscriptions mirrors each provider subscription; signed
--    webhooks drive core.licenses through the existing C-4 lifecycle
--    (activateLicense/deactivateLicense), so ADR-9's never-delete/30-day-grace rules
--    apply unchanged to non-payment and cancellation.
--
-- B. Collections -- a business collects from ITS customers against a core.documents
--    invoice (02-FSM-PRD.md's "online payment link"). Each business connects its own
--    gateway account (core.payment_gateway_accounts, secrets encrypted application-side
--    exactly like BYOK AI keys); core.payment_requests tracks each hosted payment
--    link/checkout; a paid webhook lands as an ordinary core.payments row
--    (method 'stripe'/'razorpay') + allocation via core.record_gateway_payment(), so
--    balances, aging, period-close and audit controls all apply with no special cases.
--    The platform never holds tenant funds (no Stripe Connect / Razorpay Route).
--
-- core.payment_gateway_events is the webhook inbox for both flows: deduplicated on
-- (provider, provider_event_id) so a provider's at-least-once retries are idempotent,
-- with processing status for failed-event replay. Payloads contain payer PII, so they're
-- purged after 90 days (core.purge_gateway_event_payloads(), run by the maintenance cron).
--
-- Entity-ownership: payments stay in core.payments (00-MASTER-PLAN.md §5, "Payment");
-- subscriptions/prices are new core concepts added to the map in the same commit.

-- ---------------------------------------------------------------------------
-- A. Platform billing
-- ---------------------------------------------------------------------------

create table core.billing_prices (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references core.modules (key),
  provider text not null check (provider in ('stripe', 'razorpay')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  -- Stripe price_..., Razorpay plan_... -- created in the provider's dashboard, then
  -- registered here (per environment: test-mode and live-mode ids differ).
  provider_price_id text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider, provider_price_id)
);

create unique index billing_prices_one_active_key
  on core.billing_prices (module_key, provider, currency, billing_interval)
  where is_active;

alter table core.billing_prices enable row level security;
create policy "authenticated users can view active prices"
  on core.billing_prices for select
  to authenticated
  using (is_active);
revoke insert, update, delete on core.billing_prices from authenticated;

create table core.subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references core.accounts (id) on delete cascade,
  business_id uuid not null references core.businesses (id) on delete cascade,
  module_key text not null references core.modules (key),
  provider text not null check (provider in ('stripe', 'razorpay')),
  provider_subscription_id text not null,
  provider_customer_id text,
  price_id uuid references core.billing_prices (id),
  status text not null check (status in ('incomplete', 'active', 'past_due', 'halted', 'cancelled', 'paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Provider-side hosted page to finish an incomplete subscription (Razorpay short_url).
  checkout_url text,
  -- Timestamp of the provider event last applied -- an older event arriving late
  -- (providers don't guarantee ordering) is ignored rather than rolling state back.
  provider_updated_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index subscriptions_business_module_idx on core.subscriptions (business_id, module_key);
create index subscriptions_account_id_idx on core.subscriptions (account_id);

create trigger subscriptions_set_updated_at
  before update on core.subscriptions
  for each row execute function core.set_updated_at();

alter table core.subscriptions enable row level security;
create policy "members can view their business subscriptions"
  on core.subscriptions for select
  using (business_id in (select core.user_business_ids()));
-- Written only by the service-role billing code (checkout start + signed webhooks).
revoke insert, update, delete on core.subscriptions from authenticated;

create function core.log_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status
     or new.cancel_at_period_end is distinct from old.cancel_at_period_end then
    perform core.append_audit_log(
      new.business_id, auth.uid(), 'subscription.status_changed', 'subscription', new.id,
      case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status, 'cancel_at_period_end', old.cancel_at_period_end) end,
      jsonb_build_object('status', new.status, 'cancel_at_period_end', new.cancel_at_period_end,
                         'module_key', new.module_key, 'provider', new.provider)
    );
  end if;
  return new;
end;
$$;

create trigger subscriptions_log_change
  after insert or update on core.subscriptions
  for each row execute function core.log_subscription_change();

-- ---------------------------------------------------------------------------
-- Webhook inbox (both flows)
-- ---------------------------------------------------------------------------

create table core.payment_gateway_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'razorpay')),
  provider_event_id text not null,
  scope text not null check (scope in ('platform', 'business')),
  business_id uuid references core.businesses (id) on delete set null,
  event_type text not null,
  payload jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text,
  attempts integer not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create index payment_gateway_events_status_idx on core.payment_gateway_events (status, received_at);

alter table core.payment_gateway_events enable row level security;
revoke all on core.payment_gateway_events from authenticated;

create function core.purge_gateway_event_payloads(p_older_than interval default interval '90 days')
returns integer
language sql
security definer
set search_path = core
as $$
  with purged as (
    update core.payment_gateway_events set payload = null
    where payload is not null and received_at < now() - p_older_than and status in ('processed', 'ignored')
    returning 1
  )
  select count(*)::integer from purged;
$$;

revoke execute on function core.purge_gateway_event_payloads(interval) from public, anon, authenticated;
grant execute on function core.purge_gateway_event_payloads(interval) to service_role;

-- ---------------------------------------------------------------------------
-- B. Collections
-- ---------------------------------------------------------------------------

create table core.payment_gateway_accounts (
  business_id uuid not null references core.businesses (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'razorpay')),
  -- Razorpay key_id (public half of the key pair); null for Stripe.
  key_id text,
  -- AES-256-GCM ciphertext (packages/core/src/crypto/api-key.ts), never plaintext.
  encrypted_secret text not null,
  encrypted_webhook_secret text not null,
  secret_fingerprint text not null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, provider)
);

create trigger payment_gateway_accounts_set_updated_at
  before update on core.payment_gateway_accounts
  for each row execute function core.set_updated_at();

alter table core.payment_gateway_accounts enable row level security;
create policy "billing managers can view their gateway accounts"
  on core.payment_gateway_accounts for select
  using (
    business_id in (select core.user_business_ids())
    and core.has_permission(business_id, 'billing.manage')
  );
-- Column-level: even a billing manager's session can never read the ciphertexts --
-- decryption happens only in server code through the service role.
revoke all on core.payment_gateway_accounts from authenticated;
grant select (business_id, provider, key_id, secret_fingerprint, is_active, created_at, updated_at)
  on core.payment_gateway_accounts to authenticated;

create function core.log_gateway_account_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  perform core.append_audit_log(
    coalesce(new.business_id, old.business_id), coalesce(new.created_by, auth.uid()),
    'payment_gateway.' || lower(tg_op), 'payment_gateway_account', null,
    case when tg_op <> 'INSERT' then jsonb_build_object('provider', old.provider, 'fingerprint', old.secret_fingerprint, 'is_active', old.is_active) end,
    case when tg_op <> 'DELETE' then jsonb_build_object('provider', new.provider, 'fingerprint', new.secret_fingerprint, 'is_active', new.is_active) end
  );
  return coalesce(new, old);
end;
$$;

create trigger payment_gateway_accounts_log_change
  after insert or update or delete on core.payment_gateway_accounts
  for each row execute function core.log_gateway_account_change();

create table core.payment_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  document_id uuid not null references core.documents (id) on delete restrict,
  provider text not null check (provider in ('stripe', 'razorpay')),
  provider_ref text,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'created' check (status in ('created', 'paid', 'expired', 'cancelled', 'failed')),
  url text,
  payment_id uuid references core.payments (id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payment_requests_provider_ref_key
  on core.payment_requests (provider, provider_ref) where provider_ref is not null;
create index payment_requests_document_id_idx on core.payment_requests (document_id);
create index payment_requests_business_id_idx on core.payment_requests (business_id);

create trigger payment_requests_set_updated_at
  before update on core.payment_requests
  for each row execute function core.set_updated_at();

alter table core.payment_requests enable row level security;
create policy "members can view payment requests in their businesses"
  on core.payment_requests for select
  using (business_id in (select core.user_business_ids()));
revoke insert, update, delete on core.payment_requests from authenticated;

-- core.payments learns about gateway-collected money. created_by becomes nullable: a
-- webhook-recorded payment has no signed-in user (the audit trail records it as system).
alter table core.payments drop constraint payments_method_check;
alter table core.payments add constraint payments_method_check
  check (method in ('cash', 'cheque', 'upi', 'bank', 'card_offline', 'other', 'stripe', 'razorpay'));
alter table core.payments alter column created_by drop not null;
alter table core.payments add column gateway_payment_id text;
alter table core.payments add column payment_request_id uuid references core.payment_requests (id);
-- Idempotency backstop: one provider payment can only ever be recorded once.
create unique index payments_gateway_payment_key
  on core.payments (method, gateway_payment_id) where gateway_payment_id is not null;

-- Atomically records a gateway-collected payment against its request: inserts the
-- payment, allocates it to the request's document (capped at the document's open
-- balance -- any excess stays as an unallocated payment, visible for refund), marks the
-- request paid. Idempotent: a second call for the same provider payment returns the
-- already-recorded payment id without touching anything. Service role only (the
-- webhook path); the amount must match what was requested, so a tampered/partial
-- capture can't silently settle an invoice.
create function core.record_gateway_payment(
  p_payment_request_id uuid,
  p_gateway_payment_id text,
  p_amount numeric,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = core
as $$
declare
  v_request core.payment_requests%rowtype;
  v_doc core.documents%rowtype;
  v_payment_id uuid;
  v_balance numeric(14, 2);
begin
  select * into v_request from core.payment_requests where id = p_payment_request_id for update;
  if not found then
    raise exception 'Payment request % not found', p_payment_request_id;
  end if;

  select id into v_payment_id from core.payments
  where method = v_request.provider and gateway_payment_id = p_gateway_payment_id;
  if found then
    return v_payment_id;
  end if;

  if upper(p_currency) <> v_request.currency then
    raise exception 'Currency mismatch for payment request %: expected %, got %', p_payment_request_id, v_request.currency, p_currency;
  end if;
  if p_amount <> v_request.amount then
    raise exception 'Amount mismatch for payment request %: expected %, got %', p_payment_request_id, v_request.amount, p_amount;
  end if;

  select * into v_doc from core.documents where id = v_request.document_id;

  insert into core.payments (
    business_id, party_id, method, amount, reference, payment_date, notes,
    created_by, gateway_payment_id, payment_request_id
  ) values (
    v_request.business_id, v_doc.party_id, v_request.provider, p_amount, p_gateway_payment_id,
    current_date, 'Online payment for ' || coalesce(v_doc.number, 'document ' || v_doc.id::text),
    null, p_gateway_payment_id, v_request.id
  ) returning id into v_payment_id;

  select balance_amount into v_balance from core.document_balances where document_id = v_doc.id;
  if coalesce(v_balance, 0) > 0 then
    insert into core.payment_allocations (business_id, payment_id, document_id, amount)
    values (v_request.business_id, v_payment_id, v_doc.id, least(v_balance, p_amount));
  end if;

  update core.payment_requests set status = 'paid', payment_id = v_payment_id where id = v_request.id;
  return v_payment_id;
end;
$$;

revoke execute on function core.record_gateway_payment(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function core.record_gateway_payment(uuid, text, numeric, text) to service_role;
