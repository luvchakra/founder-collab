-- WonderArc Compliance backlog, COMPLY-P1-02.6 (United States -- Exemption Certificates).
-- "Resale/exemption certificate tracking per customer/registration." The mirror image of
-- `gst.tax_registrations` (this business's OWN registration) and COMPLY-P1-02.5's own
-- `gst.item_category_tax_classifications` (what a business sells): this is what a CUSTOMER
-- has told the business about why a sale to THEM shouldn't be taxed.
--
-- Checked `docs/plan/00-MASTER-PLAN.md` §5 first (backlog rule 1/5, CLAUDE.md
-- non-negotiable #5): "Party (any external company or person) | core.parties +
-- core.party_roles" is already the canonical home for a customer -- this table does NOT
-- duplicate a customer record, it references `core.parties` directly (the same reuse
-- COMPLY-P0-03.4's own `getPartyTaxContext` already established for reading a party's tax
-- identity). "Attachment / photo / signature | core.attachments" is likewise already the
-- canonical home for the certificate SCAN itself -- checked COMPLY-P0-10.1's own
-- `gst.compliance_evidence` first (the closest existing precedent for "a gst-owned
-- categorization layer on top of a core.attachments row") before deciding this needed its
-- own table rather than reusing that one: `gst.compliance_evidence`'s own
-- `related_entity_type` enum names GOVERNMENT-facing evidence kinds (a return
-- acknowledgment, a payment challan, a government notice) with no customer/certificate
-- concept at all, and its own real business rules (a validity window, a revoked status, a
-- jurisdiction scope) are genuinely different from "categorize an already-filed
-- government interaction" -- forcing this into that table would mean bolting an unrelated
-- lifecycle onto a table whose own docstring already commits it to a narrower purpose.
--
-- `attachment_id` is NULLABLE and `on delete set null` (unlike `gst.compliance_evidence`'s
-- own `not null` + `on delete cascade`) -- a deliberate, different choice, not an
-- inconsistency: there, the whole ROW exists only to categorize an attachment, so losing
-- the file legitimately means losing the row. Here, the certificate's own legal facts
-- (who issued it, what type, its own number, its own validity window) are the actual
-- record that justifies not collecting tax on a sale -- they stand on their own regardless
-- of whether a scanned copy is attached, and a business must be able to record "we have a
-- resale certificate on file, certificate #12345, valid through 2027" even before (or
-- without ever) uploading a scan.
--
-- `jurisdiction` is a NULLABLE single US state code, not a list -- a documented
-- simplification, named explicitly rather than silently narrowed: a real
-- "Multi-Jurisdiction Uniform Sales & Use Tax Certificate" or Streamlined Sales Tax
-- exemption certificate can cover SEVERAL states at once with ONE physical document, but
-- this table models one row per (business, party, jurisdiction) scope -- a business
-- holding one multi-state certificate records it as `null` (no specific state -- covers
-- every state until this platform can model a real many-state association) or as several
-- rows, one per state that actually matters to it today. No uniqueness constraint on
-- `certificate_number` is enforced (a customer's own renewed certificate may reuse the
-- same number after its prior version expired, and this schema already has one documented
-- NULL-in-a-unique-index gap in a sibling table -- `gst.tax_rules`, flagged by a prior
-- story's own audit entry -- deliberately not repeated here by adding a second
-- nullable-column uniqueness constraint with the same shape).
--
-- `status` (`active`/`revoked`) is a distinct fact from date-based expiry: a certificate a
-- business explicitly learns is no longer valid (e.g. the state revoked the customer's own
-- exemption) must be markable invalid immediately, independent of its own `expires_at`
-- date. `lib/exemption-certificates/validity.ts`'s own `isExemptionCertificateValid` is
-- the actual combiner (status AND issued-date-has-arrived AND not-yet-expired) -- this
-- table stores only the underlying facts, never a precomputed "is this valid today"
-- boolean that would silently go stale.
--
-- No hard DELETE, only a `revoked` status -- the same "preserve historical filing/evidence
-- state" discipline (backlog rule 13) `gst.tax_registrations.registration_status` and
-- `gst.us_physical_nexus_facts.ended_at` already apply: a business that stopped honoring
-- a customer's certificate still needs to show it once had one on file, for whichever
-- period it was relied on.

create table gst.exemption_certificates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  country text not null default 'US',
  -- US state's own two-letter USPS code (lib/compliance/us-states.ts, COMPLY-P1-02.1) --
  -- validated against that catalog in application code when country = 'US', matching every
  -- other jurisdiction-shaped column in this schema. null = not state-specific (see above).
  jurisdiction text check (jurisdiction is null or jurisdiction ~ '^[A-Z]{2}$'),
  -- lib/exemption-certificates/types.ts's own fixed vocabulary -- validated in application
  -- code, not a DB enum, matching gst.item_category_tax_classifications.tax_category.
  certificate_type text not null,
  certificate_number text not null,
  issued_date date not null,
  expires_at date check (expires_at is null or expires_at >= issued_date),
  status text not null default 'active' check (status in ('active', 'revoked')),
  attachment_id uuid references core.attachments (id) on delete set null,
  notes text,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exemption_certificates_business_id_idx on gst.exemption_certificates (business_id);
create index exemption_certificates_party_id_idx on gst.exemption_certificates (party_id);

create trigger exemption_certificates_set_updated_at
  before update on gst.exemption_certificates
  for each row execute function core.set_updated_at();

-- Confused-deputy guards for BOTH foreign keys this row carries into other tables --
-- party_id (the same class of gap core.items.supplier_party_id's own trigger closed) and
-- attachment_id (the same class of gap gst.compliance_evidence's own trigger closed).
create function gst.enforce_exemption_certificate_business_id()
returns trigger
language plpgsql
security definer
set search_path = gst, core
as $$
declare
  actual_party_business_id uuid;
  actual_attachment_business_id uuid;
begin
  select business_id into actual_party_business_id from core.parties where id = new.party_id;
  if actual_party_business_id is null or actual_party_business_id <> new.business_id then
    raise exception 'party_id % does not belong to business_id %', new.party_id, new.business_id;
  end if;

  if new.attachment_id is not null then
    select business_id into actual_attachment_business_id from core.attachments where id = new.attachment_id;
    if actual_attachment_business_id is null or actual_attachment_business_id <> new.business_id then
      raise exception 'attachment_id % does not belong to business_id %', new.attachment_id, new.business_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger exemption_certificates_enforce_business_id
  before insert or update on gst.exemption_certificates
  for each row execute function gst.enforce_exemption_certificate_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). Write gated by a new,
-- dedicated `gst.manage_exemption_certificates` permission (owner/admin only) -- following
-- `gst.compliance_evidence`'s own precedent of a scoped permission per compliance-adjacent
-- write surface, rather than the broader `settings.manage` `gst.tax_registrations`/
-- `gst.us_physical_nexus_facts`/`gst.item_category_tax_classifications` already use.
-- UPDATE is allowed (to revoke a certificate or attach a scan after the fact); no DELETE
-- policy at all -- revoke via `status`, never remove (see above).
-- ---------------------------------------------------------------------------

alter table gst.exemption_certificates enable row level security;

create policy "business members can view their exemption certificates"
  on gst.exemption_certificates for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "certificate managers can record exemption certificates"
  on gst.exemption_certificates for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_exemption_certificates')
  );

create policy "certificate managers can update exemption certificates"
  on gst.exemption_certificates for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_exemption_certificates')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.manage_exemption_certificates')
  );

grant select, insert, update on gst.exemption_certificates to authenticated;
grant all on gst.exemption_certificates to service_role;

insert into core.permissions (key, module, description) values
  ('gst.manage_exemption_certificates', 'gst', 'Record and revoke customer resale/exemption certificates')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.manage_exemption_certificates'),
  ('admin', 'gst.manage_exemption_certificates')
on conflict (role, permission_key) do nothing;
