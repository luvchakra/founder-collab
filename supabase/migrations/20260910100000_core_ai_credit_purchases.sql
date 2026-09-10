-- "Buy monthly AI credits" (Razorpay, fixed plans): an account-level top-up on top of
-- each workspace's own free-tier allowance (module-discovery/lib/usage/limits.ts). Lives
-- in `core`, account_id-keyed -- BYOK/platform-credit resolution is already account-scoped
-- (discovery.ai_provider_credentials), and Billing itself is an account-wide settings page
-- (apps/web/.../dashboard/settings/billing), not a per-business or per-workspace one.
--
-- Two tables:
-- - ai_credit_purchases: append-only record of every purchase attempt (Razorpay order
--   created, then either paid or failed) -- an audit trail, not the live balance.
-- - ai_credit_balances: one row per account holding the actual spendable remaining_runs
--   count, credited atomically when a purchase is marked paid and decremented atomically
--   each time module-discovery's usage-limit check (assertWithinUsageLimit) falls back to
--   it after a workspace exceeds its own free allowance.
--
-- No client-side insert/update policy on either table: order creation and payment
-- crediting both run server-side (the create-order route resolves the account from the
-- authenticated session itself, never from client input; the payment webhook has no
-- authenticated session at all) via the admin client, which bypasses RLS by design --
-- see packages/core/src/db/admin.ts. Only SELECT is exposed to the account's own members,
-- so a founder can see their own purchase history and balance but can't fabricate a paid
-- purchase or credit themselves extra runs directly.

create table core.ai_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references core.accounts (id) on delete cascade,
  plan_key text not null,
  credited_runs integer not null check (credited_runs > 0),
  amount_inr_paise integer not null check (amount_inr_paise > 0),
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  razorpay_signature text,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index ai_credit_purchases_account_id_idx on core.ai_credit_purchases (account_id);

create table core.ai_credit_balances (
  account_id uuid primary key references core.accounts (id) on delete cascade,
  remaining_runs integer not null default 0 check (remaining_runs >= 0),
  updated_at timestamptz not null default now()
);

alter table core.ai_credit_purchases enable row level security;
alter table core.ai_credit_balances enable row level security;

create policy "members can view their account's credit purchases"
  on core.ai_credit_purchases for select
  using (account_id in (select core.user_account_ids()));

create policy "members can view their account's credit balance"
  on core.ai_credit_balances for select
  using (account_id in (select core.user_account_ids()));

-- Marks a 'created' purchase 'paid' and credits its runs onto the account's balance in
-- one transaction -- called only from the Razorpay webhook route (admin client, signature
-- already verified there). Idempotent: a webhook retry (Razorpay's own documented
-- behavior) re-targets a purchase already flipped to 'paid' by the `status = 'created'`
-- guard, updates zero rows, and the credit step is skipped -- a purchase is credited
-- exactly once no matter how many times the webhook fires for it.
create function core.credit_ai_purchase_paid(
  p_purchase_id uuid,
  p_payment_id text,
  p_signature text
)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_account_id uuid;
  v_credited_runs integer;
begin
  update core.ai_credit_purchases
  set status = 'paid', razorpay_payment_id = p_payment_id, razorpay_signature = p_signature, paid_at = now()
  where id = p_purchase_id and status = 'created'
  returning account_id, credited_runs into v_account_id, v_credited_runs;

  if v_account_id is null then
    return;
  end if;

  insert into core.ai_credit_balances (account_id, remaining_runs, updated_at)
  values (v_account_id, v_credited_runs, now())
  on conflict (account_id) do update
    set remaining_runs = core.ai_credit_balances.remaining_runs + excluded.remaining_runs,
        updated_at = now();
end;
$$;

revoke execute on function core.credit_ai_purchase_paid(uuid, text, text) from public, anon, authenticated;

-- Atomically spends one purchased run for `p_account_id` if any remain, returning whether
-- it succeeded -- the single-row `update ... where remaining_runs > 0` is what makes this
-- safe under concurrent AI calls racing the same balance (no read-then-write gap). Granted
-- to `authenticated` since it only ever spends the caller's *own* account's already-paid-
-- for balance; there's no cross-tenant read or write surface here to protect against.
create function core.consume_purchased_ai_credit(p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = core
as $$
declare
  v_rows integer;
begin
  update core.ai_credit_balances
  set remaining_runs = remaining_runs - 1, updated_at = now()
  where account_id = p_account_id and remaining_runs > 0;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke execute on function core.consume_purchased_ai_credit(uuid) from public, anon;
grant execute on function core.consume_purchased_ai_credit(uuid) to authenticated;
