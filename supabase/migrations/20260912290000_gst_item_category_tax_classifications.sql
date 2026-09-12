-- WonderArc Compliance backlog, COMPLY-P1-02.5 (United States -- Product/Service
-- Taxability). "Which item/service categories are taxable, exempt, or reduced-rate per
-- state" -- unlike India GST/EU VAT (one HSN/SAC or CN commodity code drives the whole
-- determination), US sales tax carve-outs are named by everyday product CATEGORY
-- (clothing, groceries, ...), so this needs a classification concept `lib/inventory-tax-
-- context/hsn-sac.ts`'s own HSN/SAC validator has no equivalent for.
--
-- Checked `docs/plan/00-MASTER-PLAN.md` §5 first (backlog rule 1/5, CLAUDE.md
-- non-negotiable #5): "Item category | core.item_categories | inventory, fsm" is already
-- the canonical home for a business's own product categories (name/description/parent_id,
-- `20260906103000_core_items.sql`) -- this story does NOT invent a parallel product
-- taxonomy. What's missing is the link from that free-text, per-business category to this
-- platform's own fixed, closed `UsProductTaxCategory` vocabulary
-- (`lib/us-product-taxability/categories.ts`) a versioned `gst.tax_rules` row can actually
-- key off of -- a business's own category named "Kids Apparel" means nothing to a
-- Pennsylvania clothing-exemption rule until it's tagged "clothing". This table is exactly
-- that link, Compliance-owned (backlog §5: Compliance owns "tax interpretation"), never
-- duplicating `core.item_categories` itself.
--
-- A tenant-owned CONFIGURATION choice, not an immutable fact-of-record the way
-- `gst.tax_determinations`/`gst.us_physical_nexus_facts` are -- a business may reclassify
-- or remove a mapping at any time with no need to preserve the prior value (the audit trail
-- that matters is the resulting `gst.tax_determinations` snapshot a later transaction would
-- cite, not this classification config itself). Supports UPDATE and DELETE, matching
-- `gst.compliance_profiles`/`gst.tax_registrations`'s own mutable-config precedent rather
-- than an append-only-evidence one.

create table gst.item_category_tax_classifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  category_id uuid not null references core.item_categories (id) on delete cascade,
  -- lib/us-product-taxability/categories.ts's own fixed vocabulary -- validated in
  -- application code, not a DB enum, matching every other jurisdiction/treatment-shaped
  -- free-text column in this schema (gst.tax_rules.jurisdiction/treatment).
  tax_category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, category_id)
);

create index item_category_tax_classifications_business_id_idx on gst.item_category_tax_classifications (business_id);

create trigger item_category_tax_classifications_set_updated_at
  before update on gst.item_category_tax_classifications
  for each row execute function core.set_updated_at();

-- Same "confused deputy" gap `core.items.supplier_party_id`'s own trigger
-- (`core.enforce_item_supplier_party_business_id`) already closed, applied here: nothing
-- but this trigger would stop a member of business B from pointing category_id at a
-- core.item_categories row that actually belongs to business A while business_id correctly
-- says B (RLS's own with-check only inspects the row's own business_id column).
create function gst.enforce_item_category_tax_classification_business_id()
returns trigger
language plpgsql
security definer
set search_path = gst, core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.item_categories where id = new.category_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'category_id % does not belong to business_id %', new.category_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger item_category_tax_classifications_enforce_business_id
  before insert or update on gst.item_category_tax_classifications
  for each row execute function gst.enforce_item_category_tax_classification_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8), write gated by
-- `settings.manage` -- same shape as `gst.tax_registrations`/`gst.us_physical_nexus_facts`
-- (this is a settings-shaped tax-configuration decision, not automatic record-keeping).
-- Unlike those two, DELETE is allowed here (see the mutable-config reasoning above).
-- ---------------------------------------------------------------------------

alter table gst.item_category_tax_classifications enable row level security;

create policy "business members can view their item category tax classifications"
  on gst.item_category_tax_classifications for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "settings managers can create item category tax classifications"
  on gst.item_category_tax_classifications for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

create policy "settings managers can update item category tax classifications"
  on gst.item_category_tax_classifications for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

create policy "settings managers can delete item category tax classifications"
  on gst.item_category_tax_classifications for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

grant select, insert, update, delete on gst.item_category_tax_classifications to authenticated;
grant all on gst.item_category_tax_classifications to service_role;
