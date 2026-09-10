-- Links a discovery.products row to the core.items row it was mirrored to/from, so
-- creating a product in either Discovery or Inventory creates the matching row in the
-- other (contract calls in module-discovery/lib/tenancy/mutations.ts and
-- module-inventory/lib/products/mutations.ts) without duplicating on every subsequent
-- sync attempt. Nullable: a Discovery product created before this existed, or one whose
-- mirrored item creation failed/was skipped (inventory not licensed), simply has no link
-- yet -- not an error state.
--
-- The FK point into core only (CLAUDE.md non-negotiable #1) -- core.items has no
-- reciprocal column back to discovery.products, since core may not depend on a module
-- schema; this one column on the module side is the sole source of truth for the link,
-- in both directions.
alter table discovery.products
  add column linked_item_id uuid references core.items (id) on delete set null;

-- A given item should back at most one discovery product.
create unique index products_linked_item_id_key
  on discovery.products (linked_item_id)
  where linked_item_id is not null;
