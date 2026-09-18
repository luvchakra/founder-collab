-- Finance F3 — banking: the accounts money actually moves through, the transactions the
-- bank reports, and the reconciliation between those and the ledger.
--
-- Bank *accounts* here are not a second copy of `gst.accounts`: a ledger account is
-- where the money is recorded, a bank account is where it physically sits, and the two
-- are joined by `ledger_account_id` rather than merged. A business can hold three current
-- accounts that all post to one "Bank" ledger account, or one account per ledger account;
-- both are normal, and neither works if the two ideas are the same row.
--
-- Nothing here belongs in `core`: a bank statement line is Finance's own working data, not
-- something another module reads (see 00-MASTER-PLAN.md §5 — no entity in that map covers
-- it). Cross-schema references point only into `core`.

-- ---------------------------------------------------------------------------
-- Bank accounts
-- ---------------------------------------------------------------------------

create table gst.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  -- The last few digits are what people recognise an account by, and all anyone needs to
  -- tell two accounts apart. Storing the full number would make this table worth
  -- stealing for no benefit to the feature.
  account_number_last4 text check (account_number_last4 ~ '^[0-9]{2,4}$'),
  bank_name text,
  ifsc text,
  account_type text not null default 'current'
    check (account_type in ('current', 'savings', 'cash', 'credit_card', 'wallet', 'other')),
  currency text not null default 'INR',
  -- Which ledger account this bank account's movements post to. Restricted rather than
  -- cascaded: unlinking silently would leave transactions with nowhere to post.
  ledger_account_id uuid references gst.accounts (id) on delete restrict,
  opening_balance numeric(18, 2) not null default 0,
  opening_balance_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index bank_accounts_business_id_idx on gst.bank_accounts (business_id);

create trigger bank_accounts_set_updated_at
  before update on gst.bank_accounts
  for each row execute function core.set_updated_at();

-- A bank account's ledger account must belong to the same business -- the same
-- cross-tenant reference-smuggling guard every other bare reference in this schema
-- already carries.
create function gst.check_bank_account_ledger_business_id()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  account_business uuid;
begin
  if new.ledger_account_id is null then return new; end if;
  select business_id into account_business from gst.accounts where id = new.ledger_account_id;
  if account_business is null or account_business <> new.business_id then
    raise exception 'a bank account''s ledger account must belong to the same business';
  end if;
  return new;
end; $$;

create trigger bank_accounts_check_ledger_business_id
  before insert or update on gst.bank_accounts
  for each row execute function gst.check_bank_account_ledger_business_id();

-- ---------------------------------------------------------------------------
-- Bank transactions
-- ---------------------------------------------------------------------------

create table gst.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  bank_account_id uuid not null references gst.bank_accounts (id) on delete cascade,
  txn_date date not null,
  description text not null default '',
  reference text,
  -- Signed: positive is money in, negative is money out. One column rather than the
  -- ledger's two, because a statement line is one movement as the bank reported it --
  -- the debit/credit split is a decision made when it is posted, not a fact about the
  -- line.
  amount numeric(18, 2) not null check (amount <> 0),
  balance_after numeric(18, 2),
  -- Where the row came from, so an imported line and a hand-entered one are told apart.
  source text not null default 'import' check (source in ('import', 'manual', 'feed')),
  -- Derived from the row's own content by the importer, and unique per bank account:
  -- re-importing an overlapping statement must not double every shared line. This is the
  -- whole of import duplicate protection, and it is the database's.
  import_fingerprint text,
  status text not null default 'unmatched'
    check (status in ('unmatched', 'matched', 'reconciled', 'ignored')),
  matched_entry_id uuid references gst.journal_entries (id) on delete set null,
  matched_at timestamptz,
  matched_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_transactions_business_id_idx on gst.bank_transactions (business_id);
create index bank_transactions_account_date_idx on gst.bank_transactions (bank_account_id, txn_date desc);
create index bank_transactions_status_idx on gst.bank_transactions (business_id, status);

create unique index bank_transactions_fingerprint_key
  on gst.bank_transactions (bank_account_id, import_fingerprint)
  where import_fingerprint is not null;

create trigger bank_transactions_set_updated_at
  before update on gst.bank_transactions
  for each row execute function core.set_updated_at();

create function gst.check_bank_transaction_business_id()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  account_business uuid;
  entry_business uuid;
begin
  select business_id into account_business from gst.bank_accounts where id = new.bank_account_id;
  if account_business is null or account_business <> new.business_id then
    raise exception 'a bank transaction must belong to the same business as its bank account';
  end if;
  if new.matched_entry_id is not null then
    select business_id into entry_business from gst.journal_entries where id = new.matched_entry_id;
    if entry_business is null or entry_business <> new.business_id then
      raise exception 'a bank transaction''s matched entry must belong to the same business';
    end if;
  end if;
  return new;
end; $$;

create trigger bank_transactions_check_business_id
  before insert or update on gst.bank_transactions
  for each row execute function gst.check_bank_transaction_business_id();

-- A transaction claiming to be matched with nothing to match against is the one state
-- that would quietly break a reconciliation, so it is a constraint rather than a
-- convention.
alter table gst.bank_transactions
  add constraint bank_transactions_matched_needs_entry
  check (status not in ('matched', 'reconciled') or matched_entry_id is not null);

-- ---------------------------------------------------------------------------
-- Reconciliations
-- ---------------------------------------------------------------------------

-- One per statement period per account: what the bank said the closing balance was, what
-- the ledger says, and whether someone signed off on the difference. Kept as a record
-- rather than recomputed, because "these books were reconciled to the statement on this
-- date" is a fact about an act someone performed, not a derivable number.
create table gst.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  bank_account_id uuid not null references gst.bank_accounts (id) on delete cascade,
  statement_start date not null,
  statement_end date not null,
  statement_closing_balance numeric(18, 2) not null,
  ledger_closing_balance numeric(18, 2) not null,
  -- statement - ledger at the moment of sign-off. Zero is the goal, not the requirement:
  -- a known, explained difference that someone accepted is a normal outcome.
  difference numeric(18, 2) not null default 0,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  notes text,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_account_id, statement_start, statement_end),
  check (statement_end >= statement_start)
);

create index bank_reconciliations_business_id_idx on gst.bank_reconciliations (business_id);

create trigger bank_reconciliations_set_updated_at
  before update on gst.bank_reconciliations
  for each row execute function core.set_updated_at();

create function gst.check_bank_reconciliation_business_id()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  account_business uuid;
begin
  select business_id into account_business from gst.bank_accounts where id = new.bank_account_id;
  if account_business is null or account_business <> new.business_id then
    raise exception 'a reconciliation must belong to the same business as its bank account';
  end if;
  return new;
end; $$;

create trigger bank_reconciliations_check_business_id
  before insert or update on gst.bank_reconciliations
  for each row execute function gst.check_bank_reconciliation_business_id();

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('gst.banking.manage', 'gst', 'Add bank accounts, import transactions and reconcile')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.banking.manage'),
  ('admin', 'gst.banking.manage')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8) on every table
-- ---------------------------------------------------------------------------

alter table gst.bank_accounts enable row level security;
alter table gst.bank_transactions enable row level security;
alter table gst.bank_reconciliations enable row level security;

create policy "business members can view bank accounts in their licensed businesses"
  on gst.bank_accounts for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "banking managers can create bank accounts"
  on gst.bank_accounts for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
  );

create policy "banking managers can update bank accounts"
  on gst.bank_accounts for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
  );

-- No delete policy: a bank account with reconciled history must not vanish. Deactivation
-- is the retirement path, exactly as for a ledger account.

create policy "business members can view bank transactions in their licensed businesses"
  on gst.bank_transactions for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "banking managers can create bank transactions"
  on gst.bank_transactions for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
  );

create policy "banking managers can update bank transactions"
  on gst.bank_transactions for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
  );

-- A statement line imported by mistake is worth being able to remove, unlike a posted
-- ledger entry -- but only while it is still unmatched. Once it has been matched or
-- reconciled it is part of a signed-off period.
create policy "banking managers can delete unmatched bank transactions"
  on gst.bank_transactions for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
    and status = 'unmatched'
  );

create policy "business members can view reconciliations in their licensed businesses"
  on gst.bank_reconciliations for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "banking managers can create reconciliations"
  on gst.bank_reconciliations for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
  );

create policy "banking managers can update open reconciliations"
  on gst.bank_reconciliations for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
    -- A completed reconciliation is a record of something someone signed off on. Correct
    -- it by reconciling the next period, not by editing the signed one.
    and status = 'in_progress'
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.banking.manage')
  );
