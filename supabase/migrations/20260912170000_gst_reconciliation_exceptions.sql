-- COMPLY-P0-08.6 (Exception Queue), the sixth and last story of COMPLY-P0-08 (India
-- Reconciliation & IMS). Checked `docs/plan/00-MASTER-PLAN.md` §5 and this backlog's own
-- §4/§5 first (backlog rule 1/5): §4 names `ComplianceIssue` as one of this backlog's own
-- generic new entities, and §5 explicitly lists "compliance issues" as Compliance-owned
-- (`gst` schema) -- no existing table anywhere in the platform covers this concept.
--
-- SCOPE, deliberately narrowed to THIS epic's own exception sources, not a fully generic
-- "any compliance issue ever" queue (backlog rule 5): COMPLY-P0-09.5's own "Risk
-- Dashboard" story explicitly lists a much wider example set ("Return not approved,
-- E-invoice deadline approaching, Missing tax registration, Invalid classification,
-- Failed submission" -- docs/plan/11-COMPLIANCE-GLOBAL-TAX-BACKLOG.md §6) that this table
-- is NOT trying to cover. `exception_type` only allows the four kinds this epic's own
-- prior stories actually produce: `supplier_mismatch`/`missing_in_2b`/`missing_in_books`
-- (COMPLY-P0-08.2's own reconciliation statuses) and `ims_pending` (COMPLY-P0-08.4's own
-- "pending" IMS action, genuinely actionable -- it must be resolved to accepted or
-- rejected before the recipient's own GSTR-3B filing). A future COMPLY-P0-09.5 can either
-- widen this table's own check constraint when it's actually built, or read this table
-- alongside its own wider risk sources -- that decision belongs to that story, not
-- invented here ahead of it.
--
-- DESIGN -- THE FIRST genuinely persisted, resolvable-over-time state in this whole
-- epic, on purpose: every prior COMPLY-P0-08 story (08.2 matching, 08.3 explanation, 08.5
-- ITC view) was deliberately schema-free, re-computed fresh on every read, explicitly
-- flagging "a real exception QUEUE is COMPLY-P0-08.6's own job, not this one's" each time
-- (see those stories' own code/log comments). This is that job: `reference_key` is the
-- natural key of the underlying issue (a supplier GSTIN for the three reconciliation
-- exception types, a `gstr2b_document_id` for `ims_pending`) so the same real-world issue
-- always maps to the same row rather than accumulating duplicates across re-syncs.
-- `summary` is a human-readable snapshot FROZEN at creation time (deliberately NOT
-- recomputed live) -- the underlying reconciliation/ITC numbers can keep changing
-- (a re-imported GSTR-2B statement, a later IMS action) but a queue entry a human is
-- actively triaging should describe what was seen when it was flagged, matching backlog
-- rule 13's "preserve historical filing/evidence state" applied to an exception record
-- rather than a filing.
--
-- SYNC IS ADDITIVE ONLY, deliberately simple (a real, plausible richer behavior --
-- auto-resolving an exception once its underlying condition disappears -- is named here
-- rather than built): `lib/exceptions/mutations.ts`'s own `syncReconciliationExceptions`
-- inserts a new `'open'` row for a candidate that has NO existing row at all for its own
-- natural key; it never touches an existing row's own `status`, whatever that is. A
-- supplier that goes from `mismatched` back to `matched` after a books correction does
-- NOT automatically close its own already-open exception -- a human resolving it (or
-- dismissing it) is the only way this platform closes one, so a business's own review
-- action is never silently overwritten by a re-sync. Building real auto-resolution
-- (detecting "this candidate no longer applies, close it") is a genuine, separate design
-- decision (does it need its own audit trail entry distinct from a human's own
-- resolve/dismiss? should it even be allowed for something a human already reviewed?) --
-- left to a future story rather than guessed at here.

create table gst.reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  return_period text not null check (return_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  exception_type text not null check (exception_type in ('supplier_mismatch', 'missing_in_2b', 'missing_in_books', 'ims_pending')),
  reference_key text not null,
  summary text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  status_history jsonb not null default '[]'::jsonb,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, return_period, exception_type, reference_key)
);

comment on table gst.reconciliation_exceptions is
  'COMPLY-P0-08.6: a triage queue of GSTR-2B reconciliation/IMS exceptions -- one row '
  'per (business, return period, exception_type, reference_key). summary is a frozen '
  'human-readable snapshot, not recomputed live. See this migration''s own docstring '
  'for why sync is additive-only (never auto-resolves an existing row).';

create index reconciliation_exceptions_business_id_idx on gst.reconciliation_exceptions (business_id);

create trigger reconciliation_exceptions_set_updated_at
  before update on gst.reconciliation_exceptions
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). Read open to any business
-- member; write behind the same `gst.manage_reconciliation` permission this whole epic
-- already uses.
-- ---------------------------------------------------------------------------

alter table gst.reconciliation_exceptions enable row level security;

create policy "business members can view reconciliation exceptions in their licensed businesses"
  on gst.reconciliation_exceptions for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "reconciliation managers can create reconciliation exceptions in their licensed businesses"
  on gst.reconciliation_exceptions for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_reconciliation')
  );

create policy "reconciliation managers can update reconciliation exceptions in their licensed businesses"
  on gst.reconciliation_exceptions for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_reconciliation')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_reconciliation')
  );

-- No delete policy -- an exception's own history (including its own resolution) is kept
-- permanently, same append-only precedent every other table in this schema follows.

grant select, insert, update on gst.reconciliation_exceptions to authenticated;
grant all on gst.reconciliation_exceptions to service_role;
