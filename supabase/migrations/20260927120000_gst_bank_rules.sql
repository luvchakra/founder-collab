-- FIN-8 (bank rules, §24): persist the categorisation that bank matching otherwise has to
-- re-derive by hand for every statement line. A rule says "a line whose description
-- contains X (money in / out, optionally within an amount range) belongs to account Y
-- (optionally, for party Z)".
--
-- Checked docs/plan/00-MASTER-PLAN.md §5 first: no categorisation rule, bank or otherwise,
-- appears in the ownership map. A rule references the canonical rows it needs -- a
-- `gst.accounts` row to post to and, optionally, a `core.parties` row -- rather than
-- restating either.
--
-- Rules suggest; a person applies. Same principle as matching ("a wrong automatic match is
-- worse than no match"): the bank screen shows which rule fits an unmatched line, and a
-- click posts the entry and matches the line. Nothing here posts on its own.
--
-- `gst.bank_transactions.rule_id` records which rule categorised a line, so a posted
-- entry can always answer "why was this line put in Rent?" (§40's explainability). Set
-- null if the rule is later deleted: the entry and the match stand on their own.

create table gst.bank_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null check (btrim(name) <> '' and length(name) <= 120),
  -- Case-insensitive "description contains". Deliberately not a regex: a founder writes
  -- "AWS" or "RENT", and a pattern language is one more thing to get wrong silently.
  match_text text not null check (length(btrim(match_text)) between 2 and 200),
  direction text not null default 'any' check (direction in ('in', 'out', 'any')),
  -- Bounds on the line's absolute amount, both optional.
  min_amount numeric(18, 2) check (min_amount is null or min_amount >= 0),
  max_amount numeric(18, 2) check (max_amount is null or max_amount >= 0),
  account_id uuid not null references gst.accounts (id) on delete restrict,
  party_id uuid references core.parties (id) on delete set null,
  -- Lower runs first; ties break on name, so which rule wins is never arbitrary.
  priority integer not null default 100 check (priority between 0 and 10000),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name),
  check (min_amount is null or max_amount is null or max_amount >= min_amount)
);

comment on table gst.bank_rules is
  'FIN-8: saved categorisation rules for bank statement lines. Suggest only -- a person '
  'applies a rule to a line, which posts a journal entry and matches the line to it.';

create index bank_rules_business_id_idx on gst.bank_rules (business_id);

create trigger bank_rules_set_updated_at
  before update on gst.bank_rules
  for each row execute function core.set_updated_at();

-- The account and party must belong to the rule's own business -- the same cross-tenant
-- reference-smuggling guard every gst table with a bare reference carries.
create function gst.check_bank_rule_business_id()
returns trigger language plpgsql security definer set search_path = gst as $$
declare
  account_business uuid;
  party_business uuid;
begin
  select business_id into account_business from gst.accounts where id = new.account_id;
  if account_business is null or account_business <> new.business_id then
    raise exception 'bank rule account must belong to the same business';
  end if;
  if new.party_id is not null then
    select business_id into party_business from core.parties where id = new.party_id;
    if party_business is null or party_business <> new.business_id then
      raise exception 'bank rule party must belong to the same business';
    end if;
  end if;
  return new;
end; $$;

create trigger bank_rules_check_business_id
  before insert or update on gst.bank_rules
  for each row execute function gst.check_bank_rule_business_id();

alter table gst.bank_transactions
  add column rule_id uuid references gst.bank_rules (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Permission -- managing rules is its own capability, distinct from importing and
-- matching statements (`gst.banking.manage`): a rule changes how every future line is
-- suggested, not just one.
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('gst.bank_rules.manage', 'gst', 'Create, edit and delete the rules that categorise bank statement lines')
on conflict (key) do nothing;

-- Owner holds every permission automatically (core.has_business_permission). Admin and
-- the Accountant operational role are granted explicitly, in both the authoritative
-- role-id table and the legacy role-key mirror existing readers still use.
insert into core.role_permission_grants (role_id, permission_key)
select r.id, 'gst.bank_rules.manage'
from core.roles r
where r.business_id is null and r.key in ('owner', 'admin', 'accountant')
on conflict do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.bank_rules.manage'),
  ('admin', 'gst.bank_rules.manage'),
  ('accountant', 'gst.bank_rules.manage')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8); writes also need the
-- permission.
-- ---------------------------------------------------------------------------

alter table gst.bank_rules enable row level security;

create policy "business members can view bank rules in their licensed businesses"
  on gst.bank_rules for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "bank rule managers can create bank rules in their licensed businesses"
  on gst.bank_rules for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.bank_rules.manage')
  );

create policy "bank rule managers can update bank rules in their licensed businesses"
  on gst.bank_rules for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.bank_rules.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.bank_rules.manage')
  );

-- A rule is configuration, not history: deleting one is allowed (lines it categorised
-- keep their entry and match; only `rule_id` is cleared).
create policy "bank rule managers can delete bank rules in their licensed businesses"
  on gst.bank_rules for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.bank_rules.manage')
  );

grant select, insert, update, delete on gst.bank_rules to authenticated;
grant all on gst.bank_rules to service_role;
