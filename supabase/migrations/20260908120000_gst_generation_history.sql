-- Epic 6, story S-2 (remaining scope): the generation-history tables the credentials
-- schema migration (20260907150000) explicitly deferred -- "a later GST slice ports
-- those alongside the generate/cancel server actions that would actually use them."
-- docs/plan/00-MASTER-PLAN.md §6's own event catalogue lists `document.issued (invoice)
-- | fsm, inventory | gst (e-invoice)` -- this migration is what that consumer (built
-- alongside this one, packages/module-gst/src/events/handlers.ts) writes into.
--
-- Unlike gst.eway_bill_credentials/einvoice_credentials (secrets, no SELECT grant at
-- all), an IRN/e-way-bill-number/QR-code is not a secret -- it belongs on the invoice's
-- own detail view, so these tables get a normal SELECT policy.
--
-- One row per document, ever: `unique (document_id)` -- a cancelled e-invoice/e-way-bill
-- cannot be regenerated for the same document under real GST rules (a fresh document
-- would need a fresh IRN); this schema doesn't model "supersede and reissue", same
-- deliberate simplification as core.documents' own "void via credit note, never
-- delete/reissue" pattern elsewhere in this platform.

create table gst.einvoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  document_id uuid not null references core.documents (id) on delete cascade,
  status text not null default 'generated' check (status in ('generated', 'cancelled')),
  irn text,
  ack_no text,
  ack_date timestamptz,
  qr_code text,
  cancel_reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id)
);

create table gst.eway_bills (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  document_id uuid not null references core.documents (id) on delete cascade,
  status text not null default 'generated' check (status in ('generated', 'cancelled')),
  eway_bill_number text,
  valid_until timestamptz,
  qr_code text,
  cancel_reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id)
);

create index einvoices_business_id_idx on gst.einvoices (business_id);
create index eway_bills_business_id_idx on gst.eway_bills (business_id);

create trigger einvoices_set_updated_at
  before update on gst.einvoices
  for each row execute function core.set_updated_at();

create trigger eway_bills_set_updated_at
  before update on gst.eway_bills
  for each row execute function core.set_updated_at();

-- Cross-tenant reference-smuggling guard, mirroring fsm.enforce_document_business_id()
-- (fsm_schema.sql) exactly -- same class of check every other module-owned table with a
-- bare cross-schema reference into core already has.
create function gst.enforce_document_business_id(p_document_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.documents where id = p_document_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'document_id % does not belong to business_id %', p_document_id, p_business_id;
  end if;
end; $$;

create function gst.check_einvoice_document_business_id()
returns trigger language plpgsql security definer set search_path = gst, core as $$
begin
  perform gst.enforce_document_business_id(new.document_id, new.business_id);
  return new;
end; $$;

create function gst.check_eway_bill_document_business_id()
returns trigger language plpgsql security definer set search_path = gst, core as $$
begin
  perform gst.enforce_document_business_id(new.document_id, new.business_id);
  return new;
end; $$;

create trigger einvoices_check_document_business_id
  before insert or update on gst.einvoices
  for each row execute function gst.check_einvoice_document_business_id();

create trigger eway_bills_check_document_business_id
  before insert or update on gst.eway_bills
  for each row execute function gst.check_eway_bill_document_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8), read available whenever the
-- license is at least active-or-grace (matching every other module read); write (the
-- actual INSERT/UPDATE this platform's own generate/cancel code paths use) requires
-- `gst.generate` on top, same defense-in-depth pattern as every other permissioned
-- write in this platform. In practice both this story's own generate/cancel mutations
-- and the document.issued consumer write through the admin client (reading a GSP
-- credential's secret columns requires it, same as gst.eway_bill_credentials always
-- has), so these INSERT/UPDATE policies are today's belt-and-suspenders backstop against
-- a future direct-client write path, not the literal mechanism enforcing this story's
-- own generate/cancel actions -- same reasoning CLAUDE.md's four-layer enforcement model
-- already expects (RLS is authoritative even when a server action's own client happens
-- to bypass it via admin privileges for an unrelated reason).
-- ---------------------------------------------------------------------------

alter table gst.einvoices enable row level security;
alter table gst.eway_bills enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['einvoices', 'eway_bills']
  loop
    execute format(
      $sql$create policy "business members can view %1$s in their licensed businesses"
        on gst.%1$I for select
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.licensed_business_ids('gst'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "gst generators can create %1$s in their licensed businesses"
        on gst.%1$I for insert
        with check (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('gst'))
          and core.has_permission(business_id, 'gst.generate')
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "gst generators can update %1$s in their licensed businesses"
        on gst.%1$I for update
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('gst'))
          and core.has_permission(business_id, 'gst.generate')
        )
        with check (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('gst'))
          and core.has_permission(business_id, 'gst.generate')
        )$sql$,
      t
    );
    -- No delete policy at all -- append-only historical record (ADR-9's own "cancel
    -- never deletes" ethos), same as core.documents' own void-via-credit-note pattern.
  end loop;
end $$;

grant select, insert, update on gst.einvoices, gst.eway_bills to authenticated;
grant all on gst.einvoices, gst.eway_bills to service_role;

-- ---------------------------------------------------------------------------
-- Permission -- one key covers view/generate/cancel (this schema has no separate
-- read-permission concept anywhere else either; the SELECT policy above already gates
-- viewing on tenant+license alone, matching how core.documents itself is viewable by
-- any business member without a dedicated permission). owner/admin only, matching
-- every other compliance-adjacent action in this platform (e.g. F-6's
-- schedule.print_work_orders).
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('gst.generate', 'gst', 'Generate and cancel e-Way Bills and e-Invoices')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.generate'),
  ('admin', 'gst.generate')
on conflict (role, permission_key) do nothing;
