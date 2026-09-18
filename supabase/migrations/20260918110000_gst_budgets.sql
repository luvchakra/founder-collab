-- Finance F10 — budgets: what a business planned to earn and spend, per account, per
-- month, against what it actually did.
--
-- Keyed on `period_start` rather than a month number, so a budget line lines up exactly
-- with `gst.accounting_periods.start_date` and with the date range every report already
-- uses. A "month 7" that means something different depending on the fiscal year start is
-- the kind of ambiguity that produces a report nobody trusts.
--
-- No budget *header* table. A budget is a set of per-account, per-month numbers, and a
-- header would exist only to be named — at the cost of every query joining through it and
-- every write worrying about which budget it belongs to.

create table gst.budget_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  account_id uuid not null references gst.accounts (id) on delete cascade,
  -- The first day of the month being budgeted.
  period_start date not null,
  amount numeric(18, 2) not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, account_id, period_start)
);

create index budget_lines_business_period_idx on gst.budget_lines (business_id, period_start);

create trigger budget_lines_set_updated_at
  before update on gst.budget_lines
  for each row execute function core.set_updated_at();

-- The same cross-tenant reference guard every other table in this schema carries.
create function gst.check_budget_line_business_id()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  account_business uuid;
begin
  select business_id into account_business from gst.accounts where id = new.account_id;
  if account_business is null or account_business <> new.business_id then
    raise exception 'a budget line''s account must belong to the same business';
  end if;
  return new;
end; $$;

create trigger budget_lines_check_business_id
  before insert or update on gst.budget_lines
  for each row execute function gst.check_budget_line_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8)
-- ---------------------------------------------------------------------------

alter table gst.budget_lines enable row level security;

create policy "business members can view budgets in their licensed businesses"
  on gst.budget_lines for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

-- Reuses `gst.accounts.write`: budgeting is setting a target against the chart of
-- accounts, and it changes no ledger balance -- a separate permission would be a
-- distinction without a difference.
create policy "account writers can set budgets"
  on gst.budget_lines for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.accounts.write')
  );

create policy "account writers can change budgets"
  on gst.budget_lines for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.accounts.write')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.accounts.write')
  );

-- A budget is a plan, not a record of anything that happened, so removing one loses no
-- history.
create policy "account writers can remove budgets"
  on gst.budget_lines for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.accounts.write')
  );
