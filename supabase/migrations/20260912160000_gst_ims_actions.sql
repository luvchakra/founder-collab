-- COMPLY-P0-08.4 (IMS Accept/Reject/Pending): the Invoice Management System action a
-- business takes on one GSTR-2B document, before that document's ITC flows into GSTR-3B.
--
-- Research, not assumption (backlog rule 6): `WebSearch` against ClearTax's and
-- TaxGuru's own IMS guides this story confirmed the real mechanics -- a recipient can
-- flag each B2B document (invoice, credit note, debit note) as Accepted, Rejected, or
-- Pending; Accepted documents auto-populate ITC in GSTR-3B; Rejected documents' ITC does
-- NOT auto-populate; Pending documents are excluded from BOTH GSTR-2B recomputation and
-- GSTR-3B until later accepted or rejected; GSTN added an optional remarks field on
-- Reject/Pending actions from the October 2025 tax period; and, critically, INACTION IS
-- "DEEMED ACCEPTANCE" -- a document nobody ever explicitly acted on is treated as
-- accepted once the recipient files their GSTR-3B.
--
-- DESIGN: "deemed acceptance" is modeled by the ABSENCE of a row, not a fourth
-- `'no_action'` action value -- an explicit action value should only ever mean "a human
-- (or a future automated rule) actually recorded this," never "the default." This is why
-- `action` only allows `'accepted' | 'rejected' | 'pending'`: `lib/ims/status.ts`'s own
-- `effectiveImsStatus()` (application layer) is where "no row yet" is surfaced as its own
-- distinct `'no_action'` display value, kept separate from the database's own narrower
-- vocabulary of things a person actually did.
--
-- One row per `gst.gstr2b_documents` row (`unique(gstr2b_document_id)`) -- IMS acts on
-- individual documents, not whole suppliers (unlike COMPLY-P0-08.2's own supplier-level
-- reconciliation, a deliberately different granularity for a deliberately different
-- purpose). `action_history` is an append-only jsonb array (`{action, remarks, at, by}`),
-- the same "one current-state row plus its own audit trail" shape
-- `gst.return_periods.status_history` already established -- a business can change its
-- mind (accept, then later reject before filing) any number of times, and every prior
-- decision stays visible.
--
-- DELIBERATELY NOT built this story (a real, plausible future need, named here rather
-- than solved -- backlog rule 5): a database-level lock once the corresponding GSTR-3B
-- period is filed (mirroring `gst.enforce_return_period_lock`'s own "protect a settled
-- fact" philosophy) -- real GST practice says IMS actions are only meaningful before the
-- recipient's own GSTR-3B filing for that period; after that, the action is moot (already
-- reflected, or not, in a filed return). Wiring that lock needs correlating
-- `gst.gstr2b_documents`' own `YYYY-MM` return period against `gst.return_periods`' own
-- `period_start`/`period_end` date-range shape across two different period conventions --
-- a genuine, separate design decision, not a one-line addition to this migration.

create table gst.ims_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  gstr2b_document_id uuid not null references gst.gstr2b_documents (id) on delete cascade,
  action text not null check (action in ('accepted', 'rejected', 'pending')),
  remarks text,
  action_history jsonb not null default '[]'::jsonb,
  acted_by uuid,
  acted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gstr2b_document_id)
);

comment on table gst.ims_actions is
  'COMPLY-P0-08.4: the current Invoice Management System action (accepted/rejected/'
  'pending) a business has taken on one gst.gstr2b_documents row, plus its own '
  'append-only action_history. Absence of a row means no explicit action has been '
  'taken yet -- real GST practice deems that "accepted" once GSTR-3B is filed, '
  'surfaced by lib/ims/status.ts, not modeled as a fourth action value here.';

create index ims_actions_business_id_idx on gst.ims_actions (business_id);

create trigger ims_actions_set_updated_at
  before update on gst.ims_actions
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cross-reference guard -- RLS's own `with check (business_id in ...)` only proves the
-- CALLER may write rows for the `business_id` they supplied; it says nothing about
-- whether `gstr2b_document_id` actually BELONGS to that same business. Without this, a
-- caller with `gst.manage_reconciliation` on their OWN business could insert an
-- `ims_actions` row whose `business_id` is theirs but whose `gstr2b_document_id` points
-- at a DIFFERENT business's document -- RLS alone would not catch it. Same class of gap
-- `gst.enforce_document_business_id()` (`20260908120000_gst_generation_history.sql`) and
-- `gst.eway_bill_movements_check_document_business_id` already close for a bare
-- cross-schema/cross-table reference; this is that same discipline applied to a
-- reference into `gst.gstr2b_documents` (a `gst`-schema table, not `core`, so the
-- existing `enforce_document_business_id()` -- hardcoded to `core.documents` -- cannot be
-- reused as-is; this is its own small function for the same shape of check).
-- ---------------------------------------------------------------------------

create function gst.enforce_gstr2b_document_business_id(p_gstr2b_document_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = gst as $$
declare v_actual uuid;
begin
  select business_id into v_actual from gst.gstr2b_documents where id = p_gstr2b_document_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'gstr2b_document_id % does not belong to business_id %', p_gstr2b_document_id, p_business_id;
  end if;
end; $$;

create function gst.check_ims_action_document_business_id()
returns trigger language plpgsql security definer set search_path = gst as $$
begin
  perform gst.enforce_gstr2b_document_business_id(new.gstr2b_document_id, new.business_id);
  return new;
end; $$;

create trigger ims_actions_check_document_business_id
  before insert or update on gst.ims_actions
  for each row execute function gst.check_ims_action_document_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). Read open to any business
-- member; write behind the same `gst.manage_reconciliation` permission COMPLY-P0-08.1
-- already introduced for GSTR-2B import (its own description already named "take IMS
-- actions" as part of that permission's job -- not a new permission this story).
-- ---------------------------------------------------------------------------

alter table gst.ims_actions enable row level security;

create policy "business members can view ims actions in their licensed businesses"
  on gst.ims_actions for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "reconciliation managers can create ims actions in their licensed businesses"
  on gst.ims_actions for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_reconciliation')
  );

create policy "reconciliation managers can update ims actions in their licensed businesses"
  on gst.ims_actions for update
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

-- No delete policy -- changing one's mind is modeled as a new action (and history entry),
-- never as removing the record entirely, same "append-only historical record" precedent
-- `gst.return_periods`/`gst.einvoices`/`gst.eway_bills` already established.

grant select, insert, update on gst.ims_actions to authenticated;
grant all on gst.ims_actions to service_role;
