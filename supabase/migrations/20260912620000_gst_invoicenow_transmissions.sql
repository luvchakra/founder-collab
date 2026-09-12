-- WonderArc Compliance backlog, COMPLY-P1-04.5/04.6 (Singapore -- InvoiceNow Adapter,
-- Transmission Status). Same "one row per document ever, append-only" shape
-- `gst.einvoices`/`gst.eway_bills` already established (20260908145043_gst_generation_
-- history.sql) -- an InvoiceNow submission is not a secret (unlike
-- `gst.eway_bill_credentials`/`einvoice_credentials`), so it gets a normal SELECT policy,
-- same as those two tables.
--
-- Checked docs/plan/00-MASTER-PLAN.md §5 and this module's own existing tables first
-- (backlog rule 1/5): the closest existing thing is `gst.einvoices` itself, but that
-- table's own columns (irn/ack_no/ack_date/qr_code) are the real NIC e-invoice (IRP) API
-- shape, specific to India -- Singapore's own InvoiceNow/Peppol transmission model is
-- genuinely different (a Peppol AS4 message id + delivery status, plus IRAS's own
-- separate data-submission id for the businesses the InvoiceNow Requirement covers, see
-- `lib/einvoicing-sg/types.ts`'s own docstring) and does not fit those columns without
-- either overloading India-specific field names or losing the distinction entirely --
-- a genuinely new, Singapore-specific table, not a duplicate of `gst.einvoices`.
--
-- `status` uses `'failed'` as a fourth value beyond `gst.einvoices`' own
-- `'generated'/'cancelled'` pair -- InvoiceNow's own asynchronous delivery model has a
-- real "the transmission attempt itself failed" outcome (a network/Access Point error)
-- distinct from `'rejected'` (the recipient's own Access Point or IRAS explicitly
-- rejected a successfully-delivered message), a distinction this table's own
-- `rejected_reason` column is scoped to actual rejections, not transmission failures.

create table gst.invoicenow_transmissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  document_id uuid not null references core.documents (id) on delete cascade,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'rejected', 'failed')),
  peppol_message_id text,
  buyer_peppol_id text,
  iras_submission_id text,
  rejected_reason text,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id)
);

create index invoicenow_transmissions_business_id_idx on gst.invoicenow_transmissions (business_id);

create trigger invoicenow_transmissions_set_updated_at
  before update on gst.invoicenow_transmissions
  for each row execute function core.set_updated_at();

-- Reuses `gst.enforce_document_business_id` (defined by 20260908145043_gst_generation_
-- history.sql) exactly -- same cross-tenant reference-smuggling guard every other
-- module-owned table with a bare cross-schema reference into core already has, no need
-- to redefine the shared check function.
create function gst.check_invoicenow_transmission_document_business_id()
returns trigger language plpgsql security definer set search_path = gst, core as $$
begin
  perform gst.enforce_document_business_id(new.document_id, new.business_id);
  return new;
end; $$;

create trigger invoicenow_transmissions_check_document_business_id
  before insert or update on gst.invoicenow_transmissions
  for each row execute function gst.check_invoicenow_transmission_document_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8), reusing the existing
-- `gst.generate` permission (COMPLY-P0-05/06's own "Generate and cancel e-Way Bills and
-- e-Invoices" key) rather than minting a new permission for what is the same class of
-- action (generating/recording a government-facing filing artifact) -- same defense-in-
-- depth pattern as `gst.einvoices`/`gst.eway_bills`.
-- ---------------------------------------------------------------------------

alter table gst.invoicenow_transmissions enable row level security;

create policy "business members can view invoicenow transmissions in their licensed businesses"
  on gst.invoicenow_transmissions for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "gst generators can create invoicenow transmissions in their licensed businesses"
  on gst.invoicenow_transmissions for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.generate')
  );

create policy "gst generators can update invoicenow transmissions in their licensed businesses"
  on gst.invoicenow_transmissions for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.generate')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.generate')
  );

-- No delete policy at all -- append-only historical record (ADR-9's own "cancel never
-- deletes" ethos), same as gst.einvoices/gst.eway_bills.

grant select, insert, update on gst.invoicenow_transmissions to authenticated;
grant all on gst.invoicenow_transmissions to service_role;
