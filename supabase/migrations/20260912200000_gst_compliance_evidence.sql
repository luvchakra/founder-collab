-- WonderArc Compliance backlog, COMPLY-P0-10.1 (Evidence Repository): the generic
-- `ComplianceEvidence` entity from the backlog's own §4 data model.
--
-- Checked `docs/plan/00-MASTER-PLAN.md` §5 first (backlog rule 1 / CLAUDE.md
-- non-negotiable #5): "Attachments" is already core-owned (`core.attachments`, "all
-- modules") -- a generic (entity_type, entity_id) file-storage mechanism with its own
-- Storage bucket, upload/list/signed-url/delete helpers already built
-- (`@cofounderai/core/attachments/*`). This migration does NOT duplicate that -- the
-- actual FILE (a filed return's acknowledgment PDF, a government notice, a payment
-- challan) is stored there, exactly as any other module already stores an attachment.
-- What `core.attachments` does NOT have, and what this backlog's own §5 explicitly lists
-- as Compliance-owned ("evidence"), is the COMPLIANCE-SPECIFIC categorization and linkage
-- a generic file attachment can't carry on its own: what KIND of evidence this is, which
-- specific compliance object (a return period, an e-invoice, ...) it supports, and (once
-- COMPLY-P0-10.5 lands) how long it must be retained. `gst.compliance_evidence` is that
-- thin, gst-owned layer ON TOP OF a `core.attachments` row -- one evidence row per
-- attachment, never a second copy of the file metadata itself.
--
-- `evidence_type` is a bounded, real-practice set (return acknowledgment, payment
-- challan, a notice received from the tax department, something submitted in response to
-- an audit/inquiry, or "other") -- same "a handful of known kinds, not a user-defined
-- catalog, until a real reason to widen it appears" call this module already made for
-- `gst.reconciliation_exceptions.exception_type`.
--
-- `related_entity_type`/`related_entity_id` name WHICH compliance object this evidence
-- supports (a specific return period, e-invoice, e-way bill, reconciliation exception, or
-- tax registration) -- both nullable together, since a piece of business-level evidence
-- (e.g. a general audit notice not about one specific filing) has no single object to
-- attach to. Deliberately NOT a foreign key: this is a cross-TABLE polymorphic reference
-- (the target varies by `related_entity_type`, spanning several different tables in this
-- same schema) -- no cross-reference integrity check is added here, the SAME documented
-- limitation `core.attachments`/`core.taggings` already carry for their own polymorphic
-- (entity_type, entity_id) pairs (see that migration's own comment): the mutation that
-- writes this row is responsible for having already read the referenced row under RLS
-- before recording a link to it.
--
-- No UPDATE, no DELETE policy at all -- evidence, once recorded, is a permanent part of
-- this business's own compliance history (backlog rule 13), same append-only precedent
-- every history table in this schema already follows. A real, honest gap named rather
-- than silently accepted: `attachment_id references core.attachments (id) on delete
-- cascade` means calling `@cofounderai/core/attachments#deleteAttachment()` directly on
-- the underlying file WOULD remove this row too -- this schema has no way to prevent that
-- generic, cross-module function from being called on an attachment that happens to be
-- evidence; the correct fix (a delete-guard trigger, or `core.attachments` itself gaining
-- an "is this referenced elsewhere" check) is a `core`-schema change out of this
-- workstream's own scope, flagged here rather than silently assumed safe.

create table gst.compliance_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  attachment_id uuid not null references core.attachments (id) on delete cascade,
  evidence_type text not null check (evidence_type in ('return_acknowledgment', 'payment_challan', 'government_notice', 'audit_response', 'other')),
  related_entity_type text check (related_entity_type in ('return_period', 'einvoice', 'eway_bill', 'reconciliation_exception', 'tax_registration')),
  related_entity_id uuid,
  description text,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint compliance_evidence_related_entity_both_or_neither
    check ((related_entity_type is null) = (related_entity_id is null)),
  unique (attachment_id)
);

comment on table gst.compliance_evidence is
  'COMPLY-P0-10.1: the compliance-specific categorization/linkage layer on top of a '
  'core.attachments row -- see this migration''s own docstring for why the file itself '
  'lives in core.attachments, not here.';

create index compliance_evidence_business_id_idx on gst.compliance_evidence (business_id);
create index compliance_evidence_related_entity_idx on gst.compliance_evidence (related_entity_type, related_entity_id);

-- Cross-reference guard for the ONE reference this table CAN cheaply verify at the
-- database level: that attachment_id's own business_id actually matches this row's own
-- business_id (the same class of gap COMPLY-P0-08.4's own gst.ims_actions migration
-- closed for gstr2b_document_id -- checked that precedent first, backlog rule 1). This
-- does not (and structurally cannot, without a per-related_entity_type dispatch) verify
-- related_entity_id itself -- see this migration's own top docstring for that
-- limitation.
create function gst.enforce_compliance_evidence_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.attachments where id = new.attachment_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'attachment_id % does not belong to business_id %', new.attachment_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger compliance_evidence_enforce_business_id
  before insert or update on gst.compliance_evidence
  for each row execute function gst.enforce_compliance_evidence_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). This is the license gate
-- `core.attachments`' own RLS does NOT have (that table is tenant-only, shared across
-- every module) -- recording a COMPLIANCE evidence categorization requires the gst
-- license, even though the underlying file row does not. Write requires the new
-- `gst.manage_evidence` permission, owner/admin only, matching every other
-- compliance-adjacent write in this module.
-- ---------------------------------------------------------------------------

alter table gst.compliance_evidence enable row level security;

create policy "business members can view their compliance evidence"
  on gst.compliance_evidence for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "evidence managers can record compliance evidence"
  on gst.compliance_evidence for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_evidence')
  );

-- No update, no delete policy -- see this migration's own top docstring.

grant select, insert on gst.compliance_evidence to authenticated;
grant all on gst.compliance_evidence to service_role;

insert into core.permissions (key, module, description) values
  ('gst.manage_evidence', 'gst', 'Upload and categorize compliance evidence (return acknowledgments, notices, payment challans)')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.manage_evidence'),
  ('admin', 'gst.manage_evidence')
on conflict (role, permission_key) do nothing;
