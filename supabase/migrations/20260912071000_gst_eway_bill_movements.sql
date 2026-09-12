-- WonderArc Compliance backlog, COMPLY-P0-06.2 (Movement Data): "Consignor/consignee/
-- transport/vehicle/distance/supply details" -- the second story of COMPLY-P0-06 (India
-- E-Way Bill), and the piece `generateEwayBill`'s own docstring (gst_generation_history's
-- generate mutation, S-2) already flagged as missing: "the real request also needs
-- transport details (vehicle number, transporter id, distance) this schema has nowhere to
-- capture."
--
-- Checked against docs/plan/00-MASTER-PLAN.md §5 and this backlog's own §5 first (backlog
-- rule 1 / CLAUDE.md non-negotiable #5):
--   - The CONSIGNOR (the filing business's own GSTIN/registered state) is already
--     `gst.tax_registrations` (COMPLY-P0-02.1) -- this table does NOT duplicate it. A
--     movement's default consignor is read from the business's own primary India/GST
--     registration at query time (`lib/eway-bill-movement/queries.ts`'s own
--     `getConsignorDetails`), not stored here.
--   - The CONSIGNEE (the document's own party) is already `core.parties` +
--     `core.tax_identities` + `core.addresses`, read via COMPLY-P0-03.1/03.4's own
--     `getDocumentContext`/`getPartyTaxContext` -- also not duplicated here.
--   - What genuinely has NO existing home anywhere in `core`/`inventory`/`fsm` (confirmed
--     against the entity-ownership map, which has no shipment/transport/vehicle concept
--     at all) is: the transaction sub-type (regular vs. bill-to-ship-to vs.
--     bill-from-dispatch-from), the sub-supply-type classification (supply/export/job
--     work/...), the transport mode/vehicle/transporter facts, the distance, and -- only
--     when a movement's own dispatch-from or ship-to location genuinely differs from the
--     consignor's registered address or the consignee's own billing/shipping address on
--     file -- an explicit override of that one location. THAT is what this table exists
--     to hold: it is a Compliance-owned "compliance document" fact (backlog §5), not a
--     second customer/party/address master (`lint-gst-no-duplicate-masters.mjs` also
--     never reserves this table's name, since it names no core concept).
--
-- One row per document, editable in place (unlike `gst.einvoices`/`gst.eway_bills`, which
-- are append-only generation HISTORY) -- movement data is draft/preparatory information a
-- business fills in and corrects before ever generating an e-way bill, not a record of a
-- government interaction. `unique (business_id, document_id)` backs the "one movement
-- record per document" upsert this story's own mutation uses. Linking this row to an
-- actual generated `gst.eway_bills` row, and deciding whether a movement record should
-- become read-only once linked, is COMPLY-P0-06.4's own job ("Document Link") -- not
-- modeled here.
--
-- Field values (transaction_type's 4 values, sub_supply_type's 9 values) were verified
-- via web search against the E-Way Bill system's own real vocabulary (Avalara/ClearTax/
-- GSTRobo/Tally Academy documentation of the NIC e-Way Bill portal's own transaction-type
-- and sub-supply-type fields -- the numeric NIC codes themselves are not reproduced here,
-- only the named categories, since this table stores application-level classifications,
-- with any GSP/NIC code MAPPING deferred to COMPLY-P0-06.3's own adapter layer, matching
-- how `gst.tax_rules.treatment`/`regime` are also free text validated in application code
-- rather than DB enums). Deliberately does NOT model the "inward" movement sub-supply-type
-- vocabulary (purchase/sales-return/etc.) -- this session's research surfaced solid,
-- multiply-corroborated sourcing only for the OUTWARD set; guessing the inward set's exact
-- wording would violate this backlog's own "verify, don't assume" discipline, so it is a
-- documented, extensible gap (the `sub_supply_type` column is unconstrained free text at
-- the database level for exactly this reason -- application code, not a DB check
-- constraint, is where a caller-facing catalog can be extended without a migration).

create table gst.eway_bill_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  document_id uuid not null references core.documents (id) on delete cascade,

  -- Supply/transaction shape. `transaction_type` is DB-validated (a small, genuinely
  -- closed NIC vocabulary); `sub_supply_type` is validated in application code only (see
  -- the "documented, extensible gap" note above).
  transaction_type text not null default 'regular'
    check (transaction_type in (
      'regular',
      'bill_to_ship_to',
      'bill_from_dispatch_from',
      'combination_bill_to_ship_to_and_bill_from_dispatch_from'
    )),
  sub_supply_type text,

  -- Transport/vehicle. All nullable -- a movement record can exist (e.g. while a document
  -- is still being prepared) before any of these are known yet.
  transport_mode text check (transport_mode is null or transport_mode in ('road', 'rail', 'air', 'ship')),
  vehicle_type text not null default 'regular' check (vehicle_type in ('regular', 'over_dimensional_cargo')),
  vehicle_number text,
  transporter_id text,
  transporter_name text,
  transporter_doc_number text,
  transporter_doc_date date,

  -- Distance -- feeds COMPLY-P0-06.2's own validity-period computation
  -- (`lib/eway-bill-movement/validity.ts`, against the versioned Rule 138(10) rule this
  -- same story's own companion migration seeds).
  distance_km integer check (distance_km is null or distance_km >= 0),

  -- Consignor/consignee OVERRIDES only -- null means "same as the business's own primary
  -- registration" (consignor) or "same as the party's own billing/shipping address on
  -- file" (consignee), read live at query time, never copied here by default. Each is a
  -- small, self-contained jsonb bag ({name, gstin, addressLine1, addressLine2, city,
  -- state, pincode}) rather than a dozen more nullable flat columns, matching
  -- `gst.tax_registrations.metadata`'s own "opaque bucket for attributes not worth
  -- dedicated columns" convention -- validated/typed in `lib/eway-bill-movement/types.ts`,
  -- not by a DB check constraint (a jsonb shape isn't something `check` can usefully
  -- enforce here).
  dispatch_from_override jsonb,
  ship_to_override jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, document_id)
);

create index eway_bill_movements_business_id_idx on gst.eway_bill_movements (business_id);

create trigger eway_bill_movements_set_updated_at
  before update on gst.eway_bill_movements
  for each row execute function core.set_updated_at();

-- Reuses gst.enforce_document_business_id(), already defined by
-- 20260908120000_gst_generation_history.sql -- same cross-tenant reference-smuggling
-- guard every other gst-schema table with a bare cross-schema reference into
-- core.documents already has.
create function gst.check_eway_bill_movement_document_business_id()
returns trigger language plpgsql security definer set search_path = gst, core as $$
begin
  perform gst.enforce_document_business_id(new.document_id, new.business_id);
  return new;
end; $$;

create trigger eway_bill_movements_check_document_business_id
  before insert or update on gst.eway_bill_movements
  for each row execute function gst.check_eway_bill_movement_document_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). Read: any business member,
-- same as `gst.eway_bills` itself. Write: gated on `gst.generate` (NOT
-- `settings.manage`) -- deliberately the SAME permission `gst.eway_bills`/`gst.einvoices`
-- generation already requires, since filling in movement data is part of the same
-- "prepare and generate an e-way bill" workflow as generation itself, not a settings
-- change (unlike `gst.tax_registrations`, which IS a settings action). No delete policy
-- -- a movement record is corrected via UPDATE (it's draft data, not a historical
-- record), never removed; a business with nothing worth recording yet simply never
-- inserts one.
-- ---------------------------------------------------------------------------

alter table gst.eway_bill_movements enable row level security;

create policy "business members can view their eway bill movement data"
  on gst.eway_bill_movements for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "gst generators can create eway bill movement data"
  on gst.eway_bill_movements for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.generate')
  );

create policy "gst generators can update eway bill movement data"
  on gst.eway_bill_movements for update
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

grant select, insert, update on gst.eway_bill_movements to authenticated;
grant all on gst.eway_bill_movements to service_role;
