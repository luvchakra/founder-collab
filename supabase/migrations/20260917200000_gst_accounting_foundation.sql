-- WonderArk Finance, F1 (Accounting Foundation): Chart of Accounts, accounting periods,
-- journal entries/lines and account mappings.
--
-- Schema choice: these live in `gst`, the schema the Finance module already owns. The
-- module key, schema and permission namespace all stay "gst" per the Finance spec's own
-- non-negotiable -- existing licenses, migrations, RLS policies and contracts are keyed
-- on it -- while the user-facing name is "Finance".
--
-- Checked docs/plan/00-MASTER-PLAN.md §5 (the anti-duplication contract) before adding
-- any of this. None of these concepts appear in that map: it assigns parties, items,
-- documents (invoices/credit notes/purchase orders), payments, numbering, attachments
-- and audit log to `core`, and this migration references those rather than restating
-- them -- a journal line points at `core.parties`/`core.items`, and a journal entry
-- points at `core.documents` for its source. What is genuinely new, and genuinely
-- Finance-owned, is double-entry bookkeeping itself: an account tree, the periods that
-- close it, and the balanced entries posted into it.

-- ---------------------------------------------------------------------------
-- Chart of Accounts
-- ---------------------------------------------------------------------------

create table gst.accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  account_number text not null,
  name text not null,
  -- The six classical statement sections. `cogs` is split out from `expense` because
  -- gross margin (revenue - COGS) is a distinct reported number, not a filter over one
  -- undifferentiated expense bucket.
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'cogs', 'expense')),
  subtype text,
  parent_account_id uuid references gst.accounts (id) on delete restrict,
  is_active boolean not null default true,
  -- A system account is one the posting engine resolves by role (A/R, Output CGST...).
  -- It can be renamed but never deactivated, or automatic posting loses its target.
  is_system boolean not null default false,
  default_tax_treatment text,
  opening_balance numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, account_number)
);

create index accounts_business_id_idx on gst.accounts (business_id);
create index accounts_parent_idx on gst.accounts (parent_account_id) where parent_account_id is not null;

create trigger accounts_set_updated_at
  before update on gst.accounts
  for each row execute function core.set_updated_at();

-- There is deliberately no `current_balance` column. A stored balance is a second source
-- of truth that drifts from the journal the moment any write path forgets to maintain
-- it; the balance is derived from posted journal lines instead (see gst.account_balances
-- below), which cannot disagree with the ledger because it *is* the ledger.

-- A parent account must belong to the same business -- without this, an account tree
-- could be re-parented across tenants by smuggling in another business's id.
create function gst.check_account_parent_business_id()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  parent_business uuid;
begin
  if new.parent_account_id is null then return new; end if;
  select business_id into parent_business from gst.accounts where id = new.parent_account_id;
  if parent_business is null or parent_business <> new.business_id then
    raise exception 'parent account must belong to the same business';
  end if;
  if new.parent_account_id = new.id then
    raise exception 'an account cannot be its own parent';
  end if;
  return new;
end; $$;

create trigger accounts_check_parent_business_id
  before insert or update on gst.accounts
  for each row execute function gst.check_account_parent_business_id();

-- ---------------------------------------------------------------------------
-- Accounting periods
-- ---------------------------------------------------------------------------

create table gst.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  fiscal_year integer not null,
  start_date date not null,
  end_date date not null,
  -- The GST return period this accounting period maps to (e.g. '2026-09'), so filing
  -- preparation and the ledger agree on what "September" means for a business whose
  -- fiscal year does not start in January.
  gst_period text,
  status text not null default 'open'
    check (status in ('open', 'review', 'locked', 'filed', 'closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, start_date, end_date),
  check (end_date >= start_date)
);

create index accounting_periods_business_id_idx on gst.accounting_periods (business_id);
create index accounting_periods_range_idx on gst.accounting_periods (business_id, start_date, end_date);

create trigger accounting_periods_set_updated_at
  before update on gst.accounting_periods
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Journal entries and lines
-- ---------------------------------------------------------------------------

create table gst.journal_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  entry_number text,
  -- Posting date drives which period the entry falls in; document date is the date on
  -- the underlying paperwork. They differ whenever a document is entered late.
  posting_date date not null,
  document_date date,
  period_id uuid references gst.accounting_periods (id) on delete restrict,
  memo text,
  status text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  -- Source traceability: every automatically generated posting must be explainable by
  -- the operational activity that created it.
  source_module text,
  source_entity_type text,
  source_entity_id uuid,
  source_document_id uuid references core.documents (id) on delete set null,
  source_event_id uuid references core.domain_events (id) on delete set null,
  -- Idempotency: processing the same source event twice must produce exactly one
  -- posting. The unique index below is what actually enforces that, in the database,
  -- rather than trusting every call site to check first.
  idempotency_key text,
  reversal_of_entry_id uuid references gst.journal_entries (id) on delete restrict,
  posting_rule_key text,
  posting_rule_version integer,
  created_by uuid references auth.users (id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index journal_entries_idempotency_key_idx
  on gst.journal_entries (business_id, idempotency_key)
  where idempotency_key is not null;

create index journal_entries_business_id_idx on gst.journal_entries (business_id);
create index journal_entries_posting_date_idx on gst.journal_entries (business_id, posting_date);
create index journal_entries_source_document_idx on gst.journal_entries (source_document_id)
  where source_document_id is not null;

create trigger journal_entries_set_updated_at
  before update on gst.journal_entries
  for each row execute function core.set_updated_at();

create table gst.journal_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  entry_id uuid not null references gst.journal_entries (id) on delete cascade,
  line_number integer not null,
  account_id uuid not null references gst.accounts (id) on delete restrict,
  -- Two columns rather than one signed amount: it keeps the debit/credit language of
  -- the ledger itself, and makes the balance invariant below a direct sum comparison
  -- instead of a sign convention every reader has to remember.
  debit numeric(18, 2) not null default 0,
  credit numeric(18, 2) not null default 0,
  -- Optional dimensions (spec: do not make every dimension mandatory). Each references
  -- the canonical core entity rather than a Finance-local copy of it.
  party_id uuid references core.parties (id) on delete set null,
  item_id uuid references core.items (id) on delete set null,
  tax_code text,
  gst_amount numeric(18, 2),
  location text,
  project_ref text,
  memo text,
  created_at timestamptz not null default now(),
  unique (entry_id, line_number),
  check (debit >= 0 and credit >= 0),
  -- A line is one side or the other, never both and never neither.
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index journal_lines_business_id_idx on gst.journal_lines (business_id);
create index journal_lines_entry_id_idx on gst.journal_lines (entry_id);
create index journal_lines_account_id_idx on gst.journal_lines (account_id);

-- A journal line's account and entry must belong to the line's own business -- the same
-- cross-tenant reference-smuggling guard every module-owned table with a bare reference
-- already carries.
create function gst.check_journal_line_business_id()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  entry_business uuid;
  account_business uuid;
begin
  select business_id into entry_business from gst.journal_entries where id = new.entry_id;
  if entry_business is null or entry_business <> new.business_id then
    raise exception 'journal line must belong to the same business as its entry';
  end if;
  select business_id into account_business from gst.accounts where id = new.account_id;
  if account_business is null or account_business <> new.business_id then
    raise exception 'journal line account must belong to the same business';
  end if;
  return new;
end; $$;

create trigger journal_lines_check_business_id
  before insert or update on gst.journal_lines
  for each row execute function gst.check_journal_line_business_id();

-- ---------------------------------------------------------------------------
-- The balance invariant, and period locking
-- ---------------------------------------------------------------------------

-- sum(debits) = sum(credits), enforced for posted entries only: a draft is explicitly a
-- work in progress and is allowed to be unbalanced while it is being built. Written as a
-- DEFERRABLE constraint trigger so an entry and its lines can be inserted in any order
-- within one transaction and are checked once, at commit -- a row-level trigger would
-- reject the first line of every two-line entry.
create function gst.check_journal_entry_balanced()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  entry_status text;
  total_debit numeric(18, 2);
  total_credit numeric(18, 2);
  line_count integer;
begin
  select status into entry_status from gst.journal_entries where id = new.id;
  if entry_status is distinct from 'posted' then return new; end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    into total_debit, total_credit, line_count
    from gst.journal_lines where entry_id = new.id;

  if line_count < 2 then
    raise exception 'a posted journal entry needs at least two lines (got %)', line_count;
  end if;
  if total_debit <> total_credit then
    raise exception 'journal entry % is unbalanced: debits % <> credits %',
      new.id, total_debit, total_credit;
  end if;
  return new;
end; $$;

create constraint trigger journal_entries_check_balanced
  after insert or update on gst.journal_entries
  deferrable initially deferred
  for each row execute function gst.check_journal_entry_balanced();

-- A locked, filed or closed period does not accept ordinary edits. Corrections go
-- through a reversing entry in an open period instead of rewriting history, which is
-- what makes a filed period's numbers still reconcile to what was filed.
create function gst.check_journal_entry_period_open()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  period_status text;
begin
  select status into period_status
    from gst.accounting_periods
    where business_id = new.business_id
      and new.posting_date between start_date and end_date
    limit 1;

  if period_status in ('locked', 'filed', 'closed') then
    raise exception 'accounting period covering % is % and cannot accept postings',
      new.posting_date, period_status;
  end if;
  return new;
end; $$;

create trigger journal_entries_check_period_open
  before insert or update on gst.journal_entries
  for each row execute function gst.check_journal_entry_period_open();

-- ---------------------------------------------------------------------------
-- Account mappings -- how the posting engine resolves an account by role
-- ---------------------------------------------------------------------------

create table gst.account_mappings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  -- A stable role the posting rules ask for by name ('accounts_receivable',
  -- 'output_cgst', 'product_revenue'...), resolved to whichever account this business
  -- actually uses for it.
  role_key text not null,
  account_id uuid not null references gst.accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, role_key)
);

create index account_mappings_business_id_idx on gst.account_mappings (business_id);

create trigger account_mappings_set_updated_at
  before update on gst.account_mappings
  for each row execute function core.set_updated_at();

create function gst.check_account_mapping_business_id()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  account_business uuid;
begin
  select business_id into account_business from gst.accounts where id = new.account_id;
  if account_business is null or account_business <> new.business_id then
    raise exception 'mapped account must belong to the same business';
  end if;
  return new;
end; $$;

create trigger account_mappings_check_business_id
  before insert or update on gst.account_mappings
  for each row execute function gst.check_account_mapping_business_id();

-- ---------------------------------------------------------------------------
-- Derived balances
-- ---------------------------------------------------------------------------

-- Posted lines only: a draft entry is not part of the ledger. Opening balance is folded
-- in so an account's balance is complete without every caller remembering to add it.
-- Security invoker (the default) so the querying user's own RLS on the underlying tables
-- decides what they can see -- the view must not become a way around tenant isolation.
-- The posted-only filter lives inside the sum, not in a WHERE clause: filtering there
-- would drop the account row entirely for an account whose only lines are still drafts,
-- hiding its opening balance instead of reporting it unchanged.
create view gst.account_balances as
  select
    a.id as account_id,
    a.business_id,
    a.account_number,
    a.name,
    a.type,
    a.opening_balance
      + coalesce(sum(
          case when e.status = 'posted' then
            case when a.type in ('asset', 'expense', 'cogs')
                 then l.debit - l.credit
                 else l.credit - l.debit end
          else 0 end), 0) as balance
  from gst.accounts a
  left join gst.journal_lines l on l.account_id = a.id
  left join gst.journal_entries e on e.id = l.entry_id
  group by a.id, a.business_id, a.account_number, a.name, a.type, a.opening_balance;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('gst.accounts.write', 'gst', 'Create and edit the chart of accounts and account mappings'),
  ('gst.journal.create', 'gst', 'Create and post journal entries'),
  ('gst.periods.manage', 'gst', 'Open, lock, file and close accounting periods')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.accounts.write'),
  ('admin', 'gst.accounts.write'),
  ('owner', 'gst.journal.create'),
  ('admin', 'gst.journal.create'),
  ('owner', 'gst.periods.manage'),
  ('admin', 'gst.periods.manage')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8) on every table
-- ---------------------------------------------------------------------------

alter table gst.accounts enable row level security;
alter table gst.accounting_periods enable row level security;
alter table gst.journal_entries enable row level security;
alter table gst.journal_lines enable row level security;
alter table gst.account_mappings enable row level security;

create policy "business members can view accounts in their licensed businesses"
  on gst.accounts for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "finance writers can create accounts in their licensed businesses"
  on gst.accounts for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.accounts.write')
  );

create policy "finance writers can update accounts in their licensed businesses"
  on gst.accounts for update
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

-- No delete policy on accounts: an account that has ever been posted to must not vanish
-- from history. Deactivation (`is_active = false`) is the supported retirement path.

create policy "business members can view accounting periods in their licensed businesses"
  on gst.accounting_periods for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "finance writers can create accounting periods in their licensed businesses"
  on gst.accounting_periods for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.periods.manage')
  );

create policy "finance writers can update accounting periods in their licensed businesses"
  on gst.accounting_periods for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.periods.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.periods.manage')
  );

create policy "business members can view journal entries in their licensed businesses"
  on gst.journal_entries for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "finance writers can create journal entries in their licensed businesses"
  on gst.journal_entries for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
  );

-- Update is restricted to entries that are still drafts: a posted entry is immutable,
-- and is corrected by posting a reversal, not by editing it. `using` is what decides
-- which existing rows are eligible, so the draft check belongs there.
create policy "finance writers can update draft journal entries in their licensed businesses"
  on gst.journal_entries for update
  using (
    status = 'draft'
    and business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
  );

create policy "business members can view journal lines in their licensed businesses"
  on gst.journal_lines for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "finance writers can create journal lines in their licensed businesses"
  on gst.journal_lines for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
  );

create policy "finance writers can change lines on draft entries in their licensed businesses"
  on gst.journal_lines for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
    and exists (select 1 from gst.journal_entries e where e.id = entry_id and e.status = 'draft')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
  );

create policy "finance writers can remove lines from draft entries in their licensed businesses"
  on gst.journal_lines for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.journal.create')
    and exists (select 1 from gst.journal_entries e where e.id = entry_id and e.status = 'draft')
  );

create policy "business members can view account mappings in their licensed businesses"
  on gst.account_mappings for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "finance writers can create account mappings in their licensed businesses"
  on gst.account_mappings for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.accounts.write')
  );

create policy "finance writers can update account mappings in their licensed businesses"
  on gst.account_mappings for update
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

grant select, insert, update on gst.accounts to authenticated;
grant select, insert, update on gst.accounting_periods to authenticated;
grant select, insert, update on gst.journal_entries to authenticated;
grant select, insert, update, delete on gst.journal_lines to authenticated;
grant select, insert, update on gst.account_mappings to authenticated;
grant select on gst.account_balances to authenticated;
grant all on gst.accounts, gst.accounting_periods, gst.journal_entries,
  gst.journal_lines, gst.account_mappings to service_role;
grant select on gst.account_balances to service_role;
