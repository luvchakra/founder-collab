-- DISC-OFFER-P0-01.1: "Introduce Business Offering" -- the primary unit of Discovery
-- moves from Product to Business Offering, per the WonderArc Discovery P0/P1 backlog.
-- Reuses `discovery.products` as the canonical Offering table rather than creating a
-- parallel `discovery.offerings` table: a product already IS a business_id-scoped
-- commercial thing (00-MASTER-PLAN.md §5's entity-ownership rule -- don't create a
-- second table for a concept already listed), and `discovery.workspaces`/`icp_profiles`/
-- `prospects`/every downstream table already keys off this row's own id chain. This is
-- purely additive (new nullable columns, a widened check constraint) -- "no destructive
-- migration," every existing product/prospect/research/signal record stays exactly as
-- it is (DISC-OFFER-P0-01.2's own acceptance criteria).
--
-- `short_description` isn't a new column -- the existing `description` column already
-- fills that role (aliased at the TypeScript/Offering-contract layer, not duplicated in
-- storage, to avoid two text fields drifting out of sync).
alter table discovery.products
  add column category text,
  add column offering_type text check (
    offering_type in (
      'product', 'service', 'subscription', 'consulting', 'professional_service',
      'maintenance', 'training', 'package', 'solution', 'other'
    )
  ),
  add column value_proposition text,
  add column primary_problem text,
  add column target_market text,
  add column detailed_description text;

-- "Offerings support active/inactive/archive" -- today's binary active/archived
-- (disableProduct()/enableProduct()) stays exactly as-is in this story; a genuine third
-- state ('inactive', distinct from a hard archive) is added to the schema now so
-- DISC-OFFER-P0-01.3's own CRUD UI can introduce the real activate/deactivate/archive
-- three-way action without a second migration.
alter table discovery.products drop constraint products_status_check;
alter table discovery.products add constraint products_status_check
  check (status in ('active', 'inactive', 'archived'));
