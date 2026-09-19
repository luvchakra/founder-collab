-- FIN-3 (Activation Wizard, §42) step 10, "Activate" -- the one thing the ten steps
-- genuinely lacked (surveyed against the live code, not the backlog's own framing:
-- 20260919100000/20260919110000's own docstrings already extended what "unposted" and
-- "exception" meant here for FIN-1/FIN-2; this is the same kind of gap for FIN-3 -- there
-- was no record anywhere of a business having gone through activation at all).
--
-- Deliberately its own small gst-schema table rather than two more columns on
-- `core.business_settings` (where `accounting_method` just landed): activating Finance
-- also runs FIN-2's backfill, a real write into `gst.journal_entries` across a business's
-- whole history, so unlike a preference field this deserves the same permission-gated RLS
-- every other gst-schema write already has (`core.business_settings`'s own looser "any
-- member may write" policy is right for that table's low-stakes fields, not for this).
--
-- One row per business, upserted: `activated_at` starts null (never activated), and once
-- set stays set -- re-running the wizard after the fact re-runs the backfill scan (which
-- is idempotent) but does not re-null `activated_at`, so "when did this business first
-- activate Finance" is never quietly rewritten by a later visit to the wizard.

create table gst.finance_activation (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  activated_at timestamptz,
  activated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table gst.finance_activation is
  'FIN-3: one row per business recording whether -- and when -- Finance''s activation '
  'wizard was completed. activated_at stays set once written; see this migration''s own '
  'docstring for why re-running the wizard does not clear it.';

create trigger finance_activation_set_updated_at
  before update on gst.finance_activation
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('gst.activation.manage', 'gst', 'Set Finance''s accounting method and fiscal year, and run the activation wizard''s backfill')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.activation.manage'),
  ('admin', 'gst.activation.manage')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). Read open to any business
-- member; write behind `gst.activation.manage`.
-- ---------------------------------------------------------------------------

alter table gst.finance_activation enable row level security;

create policy "business members can view finance activation in their licensed businesses"
  on gst.finance_activation for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "activation managers can create finance activation in their licensed businesses"
  on gst.finance_activation for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.activation.manage')
  );

create policy "activation managers can update finance activation in their licensed businesses"
  on gst.finance_activation for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.activation.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.activation.manage')
  );

-- No delete policy -- consistent with every other table in this schema; activation is a
-- fact about the business's own history, not a row to remove.

grant select, insert, update on gst.finance_activation to authenticated;
grant all on gst.finance_activation to service_role;
