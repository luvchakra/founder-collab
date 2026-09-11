-- WonderArc Compliance backlog, COMPLY-P0-02.5 (Tax Determination Snapshot): the
-- generic `TaxDetermination` entity from the backlog's own §4 data model -- "Persist the
-- result used for a transaction." §3's own product-decision language is explicit that
-- "historical transactions must retain a tax determination snapshot" -- this table is
-- that snapshot, and the last piece of COMPLY-P0-02 (Generic Tax Framework): registration
-- (02.1) -> jurisdiction (02.2) -> versioned rules (02.3) -> treatments (02.4) -> the
-- computed, persisted RESULT of applying all of the above to one real transaction (02.5).
--
-- Checked against docs/plan/00-MASTER-PLAN.md §5 first (backlog rule 1 / CLAUDE.md
-- non-negotiable #5): nothing in the platform persists a tax *computation result* as its
-- own row today -- `core.documents`' own `cgst_amount`/`sgst_amount`/`igst_amount`/
-- `total_amount` columns are the CURRENT, live, self-healing totals on the document
-- itself (COMPLY-P0-03.1's own future job to read, not duplicate), recalculated whenever
-- a line changes (that table's own trigger). This table is a different thing entirely: an
-- immutable, append-only RECORD of "here is exactly what was computed, under exactly
-- which rule version(s), at exactly what moment" -- the audit trail a live, mutable
-- document total can never be, and the backlog's own rule 13 ("preserve historical
-- filing/evidence state") and rule 11 ("never claim compliant simply because a
-- calculation succeeded") both depend on this distinction existing.
--
-- No formal "Core Transaction Contract" exists yet to reference what was taxed
-- (COMPLY-P0-03.1, a later story in the next epic) -- so, exactly like
-- `crm.opportunity.source_module`/`source_reference` (INT-06.2) already does for the same
-- "reference something in another module without a formal contract or a hard FK" need,
-- `source_module`/`source_reference` here are opaque text, not a foreign key. COMPLY-
-- P0-03.1 is free to give this a real, typed shape later; this story must not reach ahead
-- and guess that contract now (backlog rule 4/5).
--
-- Unlike `gst.tax_rules` (platform-wide, no business_id -- a fact about a country's law),
-- this table IS tenant-scoped: a determination is the result of taxing one specific
-- business's specific transaction, so it gets the same `business_id`/RLS shape as
-- `gst.tax_registrations`/`gst.compliance_profiles`. Unlike those two, though, this table
-- is IMMUTABLE once written -- no UPDATE policy and no DELETE policy at all, only INSERT
-- and SELECT: a mis-computed determination is corrected by inserting a NEW, later
-- snapshot (a recompute), never by editing the old row in place (the whole point of a
-- "snapshot" is that it never silently changes after the fact).
--
-- `rule_refs` records exactly which `gst.tax_rules` row(s) (by id, which already pins one
-- specific version) produced this result -- the traceability hook backlog rule 14 /
-- COMPLY-P0-07.4 "Return Drill-Down" / COMPLY-P0-10.4 "Source Traceability" will build on
-- later. Left as an unconstrained jsonb array of UUIDs (no FK) rather than a join table,
-- since a determination can cite zero rules (e.g. an out-of-scope/no-tax result with
-- nothing to cite) or several (e.g. CGST + SGST each backed by their own rule row), and no
-- real consumer exists yet to justify a normalized join table over this simpler shape.

create table gst.tax_determinations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  -- Opaque reference to whatever was taxed -- see this migration's own comment for why
  -- there's no FK yet (COMPLY-P0-03.1's own future job).
  source_module text not null check (length(trim(source_module)) > 0),
  source_reference text not null check (length(trim(source_reference)) > 0),
  country text not null check (country ~ '^[A-Z]{2}$'),
  -- Same "null = no sub-national jurisdiction concept" convention as
  -- gst.tax_registrations/gst.tax_rules.
  jurisdiction text,
  regime text not null,
  -- One of lib/compliance/treatments.ts's own catalog codes (COMPLY-P0-02.4), or null
  -- when the computation produced no single classifiable treatment.
  treatment text,
  taxable_amount numeric(14, 2) not null,
  tax_amount numeric(14, 2) not null,
  -- gst.tax_rules.id values (each already pins one specific version) that were applied to
  -- produce this result -- see this migration's own comment for why this is an
  -- unconstrained jsonb array rather than a join table.
  rule_refs jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index tax_determinations_business_id_idx on gst.tax_determinations (business_id);

-- The query this table exists to serve: "every determination ever computed for this
-- specific transaction" (newest first, since a transaction can be recomputed).
create index tax_determinations_source_idx
  on gst.tax_determinations (business_id, source_module, source_reference, computed_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8), same shape as every other
-- business-scoped gst table. INSERT requires only module licensing, NOT
-- `settings.manage` (unlike gst.tax_registrations/gst.compliance_profiles) -- recording a
-- determination is an automatic byproduct of a business member creating or completing an
-- ordinary transaction (an invoice, a job), not a settings-level decision, so gating it
-- behind the settings permission would block the routine case this table exists to serve.
-- No UPDATE, no DELETE policy at all -- see this migration's own comment on immutability.
-- ---------------------------------------------------------------------------

alter table gst.tax_determinations enable row level security;

create policy "business members can view their tax determinations"
  on gst.tax_determinations for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "business members can record a tax determination"
  on gst.tax_determinations for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
  );

grant select, insert on gst.tax_determinations to authenticated;
grant all on gst.tax_determinations to service_role;
