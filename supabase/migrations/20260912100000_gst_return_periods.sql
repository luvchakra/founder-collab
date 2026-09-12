-- COMPLY-P0-07.5 (Return Review Workflow): "Draft -> Validate -> Review -> Approve ->
-- File." This is the first lifecycle-STATE table this epic needs -- COMPLY-P0-07.1/07.2/
-- 07.3's own GSTR-1/3B/9 "prepare" functions are deliberately schema-free, pure on-demand
-- computations over live core.documents; COMPLY-P0-07.4 (Return Drill-Down) stayed
-- schema-free too, since drill-down only needed to resolve document ids the preparers
-- already surfaced. This story is the first one that actually needs to REMEMBER something
-- across requests -- which stage of review a given return period is at, and who moved it
-- there -- so this is the first migration in `lib/returns/` overall.
--
-- Checked `docs/plan/00-MASTER-PLAN.md` §5 and this backlog's own §4 data model first
-- (backlog rule 1 / CLAUDE.md non-negotiable #5): §4 names `ReturnDefinition`/
-- `ReturnPeriod`/`ReturnSubmission` as the generic entities this epic's own data model
-- calls for; no table anywhere in the platform already covers "which stage of review is
-- this return period at" -- `gst.tax_registrations`/`gst.tax_rules` are unrelated concepts
-- (a business's own registrations; versioned government rule content), and
-- `core.documents` is the live transaction data the return is COMPUTED FROM, not a record
-- of the return itself. `ReturnDefinition` (which return TYPES exist, their own table
-- structure/rules) is not modeled as its own table here -- GSTR-1/3B/9 are still a fixed,
-- small, hard-coded set (`return_type`'s own check constraint), the same "a handful of
-- known kinds, not a user-defined catalog" call this backlog already made for
-- `gst.tax_registrations.regime` (validated against an app-code catalog, not its own
-- table) -- inventing a `ReturnDefinition` table for three fixed values would be exactly
-- the "implement future stories implicitly" backlog rule 5 forbids until COMPLY-P1's own
-- non-India return types actually need one. `ReturnSubmission` (COMPLY-P0-07.7's own
-- "Filing/Payment Status" -- an ARN, a payment/challan reference, a government response)
-- is deliberately NOT modeled as a separate table yet either: this table's own `status =
-- 'filed'` plus its `status_history` entry already records THAT a period was marked filed
-- and by whom; the richer government-response metadata belongs to whichever columns
-- COMPLY-P0-07.7 adds (most naturally onto this same table, once that story defines what
-- it actually looks like) -- not invented here ahead of that story's own design.
--
-- One row per (business, return type, period) -- `unique(business_id, return_type,
-- period_start, period_end)` -- a period is looked up by its own natural key, not a
-- caller-supplied id, matching how `getGstr1Return(businessId, periodStart, periodEnd)`
-- itself is already addressed. `snapshot` freezes the ACTUAL prepared return content
-- (whatever `getGstr1Return`/`getGstr3bReturn`/`getGstr9Return` computed) at the moment of
-- the draft -> validated transition -- backlog rule 13's "historical transactions must
-- retain a tax determination snapshot," applied here to a whole prepared RETURN rather
-- than one document's own tax determination (COMPLY-P0-02.5's own `TaxDetermination`
-- snapshot is the per-document analog; this is the per-RETURN one). The `check (status =
-- 'draft' or snapshot is not null)` constraint makes it structurally impossible for a
-- period to ever reach 'validated' or beyond without one -- a review workflow reviewing a
-- blank is worse than no review workflow at all.
--
-- `status_history` is an append-only jsonb array of `{status, at, by}` entries, one per
-- transition (including the implicit initial 'draft' entry written at creation) -- a full,
-- ordered audit trail of who moved this period through the pipeline and when, without
-- needing four separate validated_at/validated_by, reviewed_at/reviewed_by, ... column
-- pairs (which would also make a future sixth stage, or a rejection/reopen path, a schema
-- change instead of just a new history-entry shape). Every transition is written from this
-- table's own application-layer state machine (`lib/returns/lifecycle/transitions.ts`),
-- which only allows one step FORWARD at a time (draft -> validated -> in_review ->
-- approved -> filed) -- COMPLY-P0-07.5's own one-line spec describes a forward pipeline
-- only; a reject-and-reopen-to-draft path is a real, deliberately left out gap (see that
-- module's own docstring), not modeled here.
--
-- No DELETE policy at all -- same "append-only historical record" precedent
-- `gst.einvoices`/`gst.eway_bills` already established (a return period, once created, is
-- never removed, only advanced through its own lifecycle).

create table gst.return_periods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  return_type text not null check (return_type in ('gstr1', 'gstr3b', 'gstr9')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status text not null default 'draft' check (status in ('draft', 'validated', 'in_review', 'approved', 'filed')),
  snapshot jsonb,
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_periods_snapshot_required_once_validated check (status = 'draft' or snapshot is not null),
  unique (business_id, return_type, period_start, period_end)
);

comment on table gst.return_periods is
  'COMPLY-P0-07.5: the Draft->Validate->Review->Approve->File lifecycle state for one '
  'GSTR-1/3B/9 return period. The return CONTENT itself stays computed on demand '
  '(lib/returns/{gstr1,gstr3b,gstr9}/queries.ts) until frozen into snapshot at the '
  'draft->validated transition.';

create trigger return_periods_set_updated_at
  before update on gst.return_periods
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). Read is open to any business
-- member (matching every other read-only path in this module -- a return's review status
-- is not sensitive the way, say, an e-way-bill credential secret is); write requires the
-- new `gst.file_returns` permission on top, same defense-in-depth shape `gst.generate`
-- already established for e-invoice/e-way-bill generation.
-- ---------------------------------------------------------------------------

alter table gst.return_periods enable row level security;

create policy "business members can view return periods in their licensed businesses"
  on gst.return_periods for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "return filers can create return periods in their licensed businesses"
  on gst.return_periods for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.file_returns')
  );

create policy "return filers can update return periods in their licensed businesses"
  on gst.return_periods for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.file_returns')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.file_returns')
  );

-- No delete policy -- see this file's own top-of-file docstring.

grant select, insert, update on gst.return_periods to authenticated;
grant all on gst.return_periods to service_role;

-- ---------------------------------------------------------------------------
-- Permission -- one key covers the whole review pipeline (create/validate/submit-for-
-- review/approve/mark-filed), same "one key, several related actions" shape `gst.generate`
-- already uses for generate+cancel. owner/admin only, matching every other
-- compliance-adjacent write in this platform.
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('gst.file_returns', 'gst', 'Prepare, review, approve, and mark GST/Compliance returns as filed')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.file_returns'),
  ('admin', 'gst.file_returns')
on conflict (role, permission_key) do nothing;
