-- Finance F10 — recurring journal entries: rent, depreciation, subscriptions, amortised
-- prepayments. A template plus a schedule; the drain posts each occurrence as an ordinary
-- journal entry.
--
-- The template's lines live in jsonb rather than their own table. They are not ledger
-- lines and must never be mistaken for them: nothing has been posted, no account balance
-- moves, and a query summing `gst.journal_lines` must not accidentally pick them up. What
-- they become when an occurrence runs is a real entry with real lines, and that is the
-- only row anyone reconciles against.

create table gst.recurring_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  memo text,
  frequency text not null
    check (frequency in ('monthly', 'quarterly', 'half_yearly', 'annually')),
  -- Every occurrence is computed from this date, never from the previous run: an entry
  -- anchored on the 31st runs on 30 April and then 31 May, where stepping from the last
  -- run would drift a day earlier every time a short month goes by.
  anchor_date date not null,
  end_on date,
  -- The high-water mark of what has posted, not a cursor. Comparing against it means a
  -- manually posted or skipped occurrence doesn't shift everything after it.
  last_run_on date,
  is_active boolean not null default true,
  -- [{accountId, debit, credit, memo}] — validated as balanced before it is stored, so
  -- it cannot fail silently at the database every month with nobody watching.
  template_lines jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name),
  check (end_on is null or end_on >= anchor_date),
  check (jsonb_typeof(template_lines) = 'array' and jsonb_array_length(template_lines) >= 2)
);

create index recurring_entries_business_id_idx on gst.recurring_entries (business_id);
create index recurring_entries_due_idx on gst.recurring_entries (business_id, is_active, anchor_date);

create trigger recurring_entries_set_updated_at
  before update on gst.recurring_entries
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8)
-- ---------------------------------------------------------------------------

alter table gst.recurring_entries enable row level security;

create policy "business members can view recurring entries in their licensed businesses"
  on gst.recurring_entries for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

-- Reuses `gst.journal.create`: a recurring entry is a journal entry someone scheduled,
-- and being able to schedule one you could not post by hand would be a hole in the same
-- permission.
create policy "journal writers can create recurring entries"
  on gst.recurring_entries for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
  );

create policy "journal writers can update recurring entries"
  on gst.recurring_entries for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
  );

-- Deleting a template does not touch the entries it already posted -- those are ledger
-- history and belong to the ledger, not to the schedule that produced them.
create policy "journal writers can delete recurring entries"
  on gst.recurring_entries for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
  );
