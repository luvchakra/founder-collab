-- Epic 3, story D-5: core.number_sequences + core.next_number(business_id, scope) --
-- replaces StockPilot's four separate `*_counters` tables (sales_order_counters,
-- sales_invoice_counters, credit_note_counters, sales_return_counters) with one
-- generic, per-module-reusable sequence, per 00-MASTER-PLAN.md §5 ("also issues job
-- numbers, quote numbers").
--
-- The concurrency-safe, gap-free technique is StockPilot's own already-proven
-- `next_sales_order_number()` (read live, 20260904000000_sales_orders.sql): a single
-- `INSERT ... ON CONFLICT DO UPDATE SET next_value = next_value + 1 RETURNING
-- next_value - 1` statement. Postgres serializes concurrent upserts against the same
-- conflicting key at the row level, so this needs no separate advisory lock or `FOR
-- UPDATE` -- it's an atomic read-modify-write in one statement, which is what actually
-- makes it gap-free under concurrent callers (verified by this story's own concurrent-
-- caller test). The one caller obligation this doesn't enforce for them: call
-- `core.next_number()` inside the same transaction as the document it numbers, so a
-- later rollback in that transaction also rolls back the increment -- calling it in its
-- own separate transaction and then aborting the caller's work afterward is what would
-- create a permanent gap, same caveat as StockPilot's own function always had.
--
-- Unlike StockPilot's hardcoded "financial year starts in April" logic, this reads the
-- business's own `core.business_settings.fiscal_year_start_month` (C-2) -- the whole
-- reason that column exists.
--
-- No client-facing RLS policies at all, on purpose -- exactly like StockPilot's own
-- counter tables ("the counter table has no client-facing policies at all -- only this
-- SECURITY DEFINER function touches it, so the atomic upsert is the sole path to a
-- number"). RLS enabled with zero policies denies all direct access; the function's own
-- membership check (`business_id in (select core.user_business_ids())`) is what
-- actually gates who can mint a number.

create table core.number_sequences (
  business_id uuid not null references core.businesses (id) on delete cascade,
  scope text not null,
  fiscal_year text not null,
  prefix text not null,
  next_value integer not null default 1,
  primary key (business_id, scope, fiscal_year)
);

alter table core.number_sequences enable row level security;

create function core.next_number(p_business_id uuid, p_scope text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = core
as $$
declare
  v_start_month smallint;
  v_today date := current_date;
  v_fy text;
  v_n integer;
begin
  if p_business_id not in (select core.user_business_ids()) then
    raise exception 'Not a member of this business';
  end if;

  select fiscal_year_start_month into v_start_month
  from core.business_settings where business_id = p_business_id;
  v_start_month := coalesce(v_start_month, 4);

  if extract(month from v_today) >= v_start_month then
    v_fy := to_char(v_today, 'YY') || '-' || to_char(v_today + interval '1 year', 'YY');
  else
    v_fy := to_char(v_today - interval '1 year', 'YY') || '-' || to_char(v_today, 'YY');
  end if;

  insert into core.number_sequences (business_id, scope, fiscal_year, prefix, next_value)
  values (p_business_id, p_scope, v_fy, p_prefix, 2)
  on conflict (business_id, scope, fiscal_year)
    do update set next_value = core.number_sequences.next_value + 1
  returning next_value - 1 into v_n;

  return p_prefix || '/' || v_fy || '/' || lpad(v_n::text, 4, '0');
end;
$$;

revoke execute on function core.next_number(uuid, text, text) from public, anon;
grant execute on function core.next_number(uuid, text, text) to authenticated;
