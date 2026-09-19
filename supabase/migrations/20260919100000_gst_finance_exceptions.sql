-- FIN-1 (Finance exceptions queue, §38). Checked `docs/plan/00-MASTER-PLAN.md` §5 first
-- (backlog rule 1/5): "exception"/"exceptions queue" is not a listed canonical concept
-- there, so this is not the parallel table §5 exists to prevent.
--
-- `gst.reconciliation_exceptions` (20260912170000) already persists a triage queue, but a
-- narrower one, built for one epic (GSTR-2B reconciliation/IMS): its own `exception_type`
-- check constraint only allows `supplier_mismatch | missing_in_2b | missing_in_books |
-- ims_pending`, and that migration's own docstring says widening it is a future story's
-- call, not something to bolt on ad hoc. FIN-1 asks for a different, wider queue over
-- three sources that table was never built to cover -- unposted documents (the dashboard),
-- ITC at risk (the GST ledger), filing blockers (readiness) -- so this is a second,
-- additive table, `gst.finance_exceptions`, rather than a repurposed one. The two are
-- deliberately kept apart: `open`/`resolved`/`dismissed` on one table and
-- `open`/`in_review`/`resolved`/`ignored` on this one would collide in meaning
-- (`dismissed` vs `ignored`) if merged into a single status column.
--
-- `reference_key` carries whatever return period matters, so `unposted_document`'s own key
-- is just the document id (a document isn't scoped to a period) while `itc_at_risk` and
-- `filing_blocker` embed the GST period into their own key (`itc_at_risk` per period,
-- `filing_blocker` per period+check). That is simpler than a separate nullable
-- `return_period` column that would not apply to every row.
--
-- `summary`/`impact`/`suggested_action` are frozen snapshots at sync time, not recomputed
-- live -- same reasoning as `reconciliation_exceptions.summary`: the underlying ledger can
-- keep moving, but a queue entry someone is actively triaging should describe what was
-- seen when it was flagged.
--
-- Sync is additive-only, same rule as `syncReconciliationExceptions`: a fresh sync inserts
-- an `'open'` row for a candidate with no existing row for its own natural key, and never
-- touches an existing row's own status -- a human's own triage decision is never silently
-- overwritten by a re-sync. Auto-resolution (closing a row once its underlying condition
-- disappears) is a real, separate feature, deliberately not built here.
--
-- `owner_id` is new to this schema (CRM's `owner_id` column on follow-ups/opportunities is
-- the precedent copied here) -- nothing in `gst` assigns a row to a person today.

create table gst.finance_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  exception_type text not null check (exception_type in ('unposted_document', 'itc_at_risk', 'filing_blocker')),
  reference_key text not null,
  summary text not null,
  impact text not null,
  suggested_action text,
  owner_id uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'ignored')),
  resolution_note text,
  status_history jsonb not null default '[]'::jsonb,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, exception_type, reference_key)
);

comment on table gst.finance_exceptions is
  'FIN-1: one triage queue for what otherwise sits scattered across the dashboard, the '
  'GST ledger and filing readiness. summary/impact/suggested_action are frozen snapshots, '
  'not recomputed live. Sync is additive-only -- see this migration''s own docstring.';

create index finance_exceptions_business_id_idx on gst.finance_exceptions (business_id);
create index finance_exceptions_business_status_idx on gst.finance_exceptions (business_id, status);

create trigger finance_exceptions_set_updated_at
  before update on gst.finance_exceptions
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('gst.exceptions.manage', 'gst', 'Sync the Finance exceptions queue and triage its rows (assign, review, resolve, ignore)')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.exceptions.manage'),
  ('admin', 'gst.exceptions.manage')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). Read open to any business
-- member; write behind `gst.exceptions.manage`.
-- ---------------------------------------------------------------------------

alter table gst.finance_exceptions enable row level security;

create policy "business members can view finance exceptions in their licensed businesses"
  on gst.finance_exceptions for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "finance exception managers can create finance exceptions in their licensed businesses"
  on gst.finance_exceptions for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.exceptions.manage')
  );

create policy "finance exception managers can update finance exceptions in their licensed businesses"
  on gst.finance_exceptions for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.exceptions.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.exceptions.manage')
  );

-- No delete policy -- an exception's own history, including its own resolution, is kept
-- permanently, same append-only precedent every other table in this schema follows.

-- Grants issued in the same migration as the table this time (20260918130000 exists
-- precisely because three earlier migrations forgot this step and shipped tables nothing
-- could actually read).
grant select, insert, update on gst.finance_exceptions to authenticated;
grant all on gst.finance_exceptions to service_role;
