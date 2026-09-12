-- COMPLY-P0-08.1 (GSTR-2B Fetch/Import): the actual imported statement content --
-- `gst.gstr2b_credentials` (previous migration) only configures an OPTIONAL fetch path;
-- this is where an imported GSTR-2B (fetched via that adapter, or manually uploaded --
-- the realistic universal path, since the GST Portal itself only ever serves 2B to an
-- interactively-logged-in session) actually lands.
--
-- Checked `docs/plan/00-MASTER-PLAN.md` §5 and this backlog's own §4/§5 first: `gst`
-- schema is the correct owner ("reconciliations" is explicitly listed in this backlog's
-- own §5 Compliance data-ownership list); no existing table models "a government-issued
-- ITC statement" -- `gst.tax_rules` is versioned government RULE content (rates,
-- thresholds), not a per-period, per-business STATEMENT of actual transactions, a
-- different concept entirely. `core.documents` is this platform's own books (the
-- business's purchase register, source_module='inventory'/doc_type='purchase_order') --
-- GSTR-2B is the GOVERNMENT's independent record of the same universe, kept as a wholly
-- separate table on purpose (COMPLY-P0-08.2's whole job is comparing the two, which is
-- meaningless if they're merged into one table).
--
-- Two tables, not one wide one: `gstr2b_statements` is one row per (business, return
-- period) -- the whole fetched/uploaded document, `raw` preserving the complete original
-- JSON verbatim (backlog rule 13, "preserve historical filing/evidence state" -- same
-- "never lose evidence to a narrower field selection" reasoning as `IrpSubmitResponse.raw`/
-- `gst.einvoices.raw_response`). `gstr2b_documents` is one row per B2B invoice or CDNR
-- credit/debit note inside it, normalized into this platform's own column shape so
-- COMPLY-P0-08.2 (matching) can query it like any other table instead of re-parsing JSON
-- on every read.
--
-- SCOPE, deliberately narrowed (backlog rule 5, "do not implement future stories
-- implicitly"): only the `b2b` and `cdnr` sections of a real GSTR-2B are modeled --
-- domestic purchases from registered suppliers, which is what COMPLY-P0-08.2's own
-- purchase-to-2B matching needs (it only ever compares against
-- `core.documents.doc_type = 'purchase_order'`, itself sourced only from registered
-- domestic suppliers via `core.tax_identities`). A real GSTR-2B also carries `b2ba`/
-- `cdnra` (amendments), `impg`/`impgsez` (import of goods via ICEGATE), and ISD credit
-- sections -- none of which this platform has any transaction-side counterpart for today
-- (no import/customs doc_type, no ISD concept anywhere in `core`) and are out of scope
-- for THIS story; a future story that needs them adds a `section` value and, if imports
-- are ever modeled on the transaction side, extends the matcher, not invents a second
-- statement table.
--
-- FIELD NAMES -- research, not assumption (backlog rule 6): `docdata.b2b[].ctin`/`trdnm`/
-- `supprd`/`supfildt` (supplier GSTIN/trade name/own filing period/own filing date) and
-- per-invoice `inum`/`idt`/`val`/`pos`/`txval` (invoice number/date/value/place-of-supply/
-- taxable value) are the same abbreviations GSTN's own Returns Offline Tool JSON schema
-- uses across the whole GSTR-1/2A/2B family -- confirmed via `WebSearch` against
-- tutorial.gst.gov.in's own "Returns Offline Tool FAQs and User Manual" PDF and
-- cross-referenced consistently by TallyPrime's, ERPNext's, and Bizeract's own GSTR-2B
-- JSON documentation/converters. `itc_elg` (per-invoice ITC-eligible Y/N flag) and `rsn`
-- (ineligibility reason text) are confirmed via the same cross-referenced search results
-- describing the GSTR-2B JSON's own section structure. The two REAL ineligibility reasons
-- GSTN's own GSTR-2B advisory documents (per `tutorial.gst.gov.in`/`indiafilings.com`,
-- searched this story): "recipient not entitled to ITC under Section 16(4) of the CGST
-- Act" (time-barred) and "supplier's GSTIN and place of supply are in the same State
-- while the recipient is in another State" -- both are stored verbatim in `rsn` when
-- present, never re-derived or guessed at by this platform's own code.
--
-- HONEST LIMIT, stated plainly rather than glossed over: `docs.gst.gov.in`,
-- `developer.sandbox.co.in`, and `cleartax.in` were all unreachable from this environment
-- (network egress proxy blocks them), so the exact, complete, authoritative GSTN JSON
-- schema could not be fetched and read directly this story -- the shape modeled here is
-- the best-effort, cross-referenced-from-multiple-independent-sources reconstruction
-- `lib/gstr2b/parse.ts`'s own docstring also states plainly, same evidentiary bar
-- COMPLY-P0-05.3/06.3 already applied to the IRP/e-way-bill adapters' own request shapes
-- (also never exercised against a live sandbox). A production build should validate
-- `lib/gstr2b/parse.ts` against a real GSTN sandbox or live-downloaded 2B JSON before
-- going live -- flagged here as a concrete follow-up, not silently assumed correct.
--
-- `raw` is `jsonb not null` (never null -- even a same-shape re-import keeps its own
-- original JSON) so no evidence is ever lost even if this story's own normalization turns
-- out to be wrong later; `gstr2b_documents` can be safely re-derived from `raw` by a
-- future migration/backfill if `parse.ts`'s own mapping needs correcting.
--
-- RE-IMPORT: a real GSTR-2B CAN be regenerated by GSTN for the same period (most notably
-- now that IMS actions taken up to the recipient's own GSTR-3B filing can trigger a
-- recomputed 2B) -- `unique(business_id, return_period)` plus an application-layer upsert
-- (`lib/gstr2b/mutations.ts importGstr2bStatement`, not modeled at the database layer)
-- replaces a statement's own `raw`/`fetched_at` and fully replaces its child `documents`
-- rows in one transaction, rather than accumulating duplicate/stale rows -- this is why
-- `gstr2b_documents.statement_id` cascades on delete: the mutation deletes-then-reinserts
-- a statement's own document rows on re-import, it never tries to diff them.

create table gst.gstr2b_statements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  return_period text not null check (return_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  gstin text,
  generated_on date,
  fetched_at timestamptz not null default now(),
  source text not null check (source in ('manual_upload', 'gsp_fetch')),
  raw jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, return_period)
);

comment on table gst.gstr2b_statements is
  'COMPLY-P0-08.1: one row per (business, YYYY-MM return period) GSTR-2B statement, '
  'manually uploaded or GSP-fetched. `raw` is the complete original JSON, preserved '
  'verbatim regardless of how gst.gstr2b_documents normalizes it.';

create trigger gstr2b_statements_set_updated_at
  before update on gst.gstr2b_statements
  for each row execute function core.set_updated_at();

create table gst.gstr2b_documents (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references gst.gstr2b_statements (id) on delete cascade,
  business_id uuid not null references core.businesses (id) on delete cascade,
  section text not null check (section in ('b2b', 'cdnr')),
  document_type text not null check (document_type in ('invoice', 'credit_note', 'debit_note')),
  supplier_gstin text not null,
  supplier_trade_name text,
  document_number text not null,
  document_date date,
  document_value numeric(14, 2),
  place_of_supply text,
  reverse_charge boolean not null default false,
  taxable_value numeric(14, 2) not null default 0,
  igst_amount numeric(14, 2) not null default 0,
  cgst_amount numeric(14, 2) not null default 0,
  sgst_amount numeric(14, 2) not null default 0,
  cess_amount numeric(14, 2) not null default 0,
  itc_available boolean not null default true,
  ineligibility_reason text,
  supplier_filing_period text,
  supplier_filed_date date,
  created_at timestamptz not null default now(),
  unique (statement_id, section, document_type, supplier_gstin, document_number)
);

comment on table gst.gstr2b_documents is
  'COMPLY-P0-08.1: one row per B2B invoice or CDNR credit/debit note inside a '
  'gst.gstr2b_statements row, normalized from raw for COMPLY-P0-08.2 matching. '
  'section=b2b|cdnr scope only -- see this migration file''s own docstring for why '
  'amendments/imports/ISD sections are deliberately out of scope.';

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). Read is open to any business
-- member (matching every other read-only compliance-content path -- a GSTR-2B statement's
-- own content is not a secret the way a GSP credential is); write requires the new
-- `gst.manage_reconciliation` permission, distinct from `gst.file_returns` -- importing a
-- government ITC statement and acting on IMS (accept/reject/pending, COMPLY-P0-08.4) is a
-- separate, financially consequential action from preparing/filing a return, not another
-- case of the existing return-review permission.
-- ---------------------------------------------------------------------------

alter table gst.gstr2b_statements enable row level security;
alter table gst.gstr2b_documents enable row level security;

create policy "business members can view gstr2b statements in their licensed businesses"
  on gst.gstr2b_statements for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "reconciliation managers can import gstr2b statements in their licensed businesses"
  on gst.gstr2b_statements for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_reconciliation')
  );

create policy "reconciliation managers can update gstr2b statements in their licensed businesses"
  on gst.gstr2b_statements for update
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

create policy "reconciliation managers can delete gstr2b statements in their licensed businesses"
  on gst.gstr2b_statements for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_reconciliation')
  );

create policy "business members can view gstr2b documents in their licensed businesses"
  on gst.gstr2b_documents for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "reconciliation managers can create gstr2b documents in their licensed businesses"
  on gst.gstr2b_documents for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_reconciliation')
  );

create policy "reconciliation managers can delete gstr2b documents in their licensed businesses"
  on gst.gstr2b_documents for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_reconciliation')
  );

-- No update policy on gstr2b_documents -- a document row is either re-derived wholesale
-- (delete + reinsert on statement re-import) or gains an IMS action recorded in a
-- SEPARATE table (COMPLY-P0-08.4 will add `gst.ims_actions`, not a column here) -- the
-- statement's own normalized content, once imported, is never edited in place.

grant select, insert, update, delete on gst.gstr2b_statements to authenticated;
grant all on gst.gstr2b_statements to service_role;

grant select, insert, delete on gst.gstr2b_documents to authenticated;
grant all on gst.gstr2b_documents to service_role;

insert into core.permissions (key, module, description) values
  ('gst.manage_reconciliation', 'gst', 'Import GSTR-2B statements and take Invoice Management System (IMS) actions')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.manage_reconciliation'),
  ('admin', 'gst.manage_reconciliation')
on conflict (role, permission_key) do nothing;
