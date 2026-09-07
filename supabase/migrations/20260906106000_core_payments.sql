-- Epic 3, story D-7: core.payments + core.payment_allocations + balance/aging views
-- (00-MASTER-PLAN.md §5). StockPilot has no payment ledger at all today (read live) --
-- `sales_invoices.payment_status` is just a status column, no record of how or when
-- money moved. Kickserv's "log manual payment" is the model here instead
-- (02-FSM-PRD.md: "Manual (non-card) payments must be logged as a payment on the job
-- before marking paid, or the balance won't zero out" -- and later, "record manual
-- payment (cash/cheque/UPI/bank/card-offline), partial payments... balance & aging").
--
-- One payment can be split across several documents (partial payments against
-- multiple invoices) via core.payment_allocations -- that's the whole reason payments
-- and allocations are two tables, not one.
--
-- Balance/aging are views, not columns on core.documents, so they're always correct
-- against the live allocation ledger rather than a cached total that could drift.
-- `security_invoker = true` (PG15+) so each viewer's own RLS grants (via the
-- underlying core.documents/core.payment_allocations policies) apply to the view,
-- not the view owner's.

create table core.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete restrict,
  method text not null check (method in ('cash', 'cheque', 'upi', 'bank', 'card_offline', 'other')),
  amount numeric(14, 2) not null check (amount > 0),
  reference text,
  payment_date date not null default current_date,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_business_id_idx on core.payments (business_id);
create index payments_party_id_idx on core.payments (party_id);

create trigger payments_set_updated_at
  before update on core.payments
  for each row execute function core.set_updated_at();

create function core.enforce_payment_party_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.parties where id = new.party_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'party_id % does not belong to business_id %', new.party_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger payments_enforce_party_business_id
  before insert or update on core.payments
  for each row execute function core.enforce_payment_party_business_id();

create table core.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  payment_id uuid not null references core.payments (id) on delete cascade,
  document_id uuid not null references core.documents (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index payment_allocations_business_id_idx on core.payment_allocations (business_id);
create index payment_allocations_payment_id_idx on core.payment_allocations (payment_id);
create index payment_allocations_document_id_idx on core.payment_allocations (document_id);

create function core.enforce_payment_allocation_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  payment_business_id uuid;
  doc_business_id uuid;
  already_allocated numeric(14, 2);
  payment_amount numeric(14, 2);
begin
  select business_id, amount into payment_business_id, payment_amount
  from core.payments where id = new.payment_id;
  if payment_business_id is null or payment_business_id <> new.business_id then
    raise exception 'payment_id % does not belong to business_id %', new.payment_id, new.business_id;
  end if;

  select business_id into doc_business_id from core.documents where id = new.document_id;
  if doc_business_id is null or doc_business_id <> new.business_id then
    raise exception 'document_id % does not belong to business_id %', new.document_id, new.business_id;
  end if;

  -- A payment can't be allocated for more than it's actually worth -- sum every OTHER
  -- allocation against this payment (excluding this row on an update) plus this one.
  select coalesce(sum(amount), 0) into already_allocated
  from core.payment_allocations
  where payment_id = new.payment_id and id <> new.id;
  if already_allocated + new.amount > payment_amount then
    raise exception 'allocations for payment % (%) would exceed the payment amount (%)',
      new.payment_id, already_allocated + new.amount, payment_amount;
  end if;

  return new;
end;
$$;

create trigger payment_allocations_enforce_business_id
  before insert or update on core.payment_allocations
  for each row execute function core.enforce_payment_allocation_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.payments enable row level security;
alter table core.payment_allocations enable row level security;

create policy "members can view payments in their businesses"
  on core.payments for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create payments in their businesses"
  on core.payments for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update payments in their businesses"
  on core.payments for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete payments in their businesses"
  on core.payments for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view payment allocations in their businesses"
  on core.payment_allocations for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create payment allocations in their businesses"
  on core.payment_allocations for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update payment allocations in their businesses"
  on core.payment_allocations for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete payment allocations in their businesses"
  on core.payment_allocations for delete
  using (business_id in (select core.user_business_ids()));

-- ---------------------------------------------------------------------------
-- Balance + aging views
-- ---------------------------------------------------------------------------

create view core.document_balances
with (security_invoker = true) as
select
  d.id as document_id,
  d.business_id,
  d.total_amount,
  coalesce(pa.paid_amount, 0) as paid_amount,
  d.total_amount - coalesce(pa.paid_amount, 0) as balance_amount
from core.documents d
left join (
  select document_id, sum(amount) as paid_amount
  from core.payment_allocations
  group by document_id
) pa on pa.document_id = d.id;

-- Only documents with money still outstanding, bucketed by days overdue past
-- due_date (falling back to doc_date when a doc_type has no due_date, e.g. an
-- estimate) -- the exact bucket boundaries from 02-FSM-PRD.md's "account aging"
-- report (1-30/31-60/61-90/90+).
create view core.document_aging
with (security_invoker = true) as
select
  b.document_id,
  b.business_id,
  d.party_id,
  d.doc_type,
  d.number,
  coalesce(d.due_date, d.doc_date) as due_date,
  current_date - coalesce(d.due_date, d.doc_date) as days_overdue,
  b.balance_amount,
  case
    when current_date - coalesce(d.due_date, d.doc_date) <= 0 then 'current'
    when current_date - coalesce(d.due_date, d.doc_date) <= 30 then '1-30'
    when current_date - coalesce(d.due_date, d.doc_date) <= 60 then '31-60'
    when current_date - coalesce(d.due_date, d.doc_date) <= 90 then '61-90'
    else '90+'
  end as aging_bucket
from core.document_balances b
join core.documents d on d.id = b.document_id
where b.balance_amount > 0;
