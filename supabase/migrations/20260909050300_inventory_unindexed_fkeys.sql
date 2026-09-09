-- Supabase advisor "unindexed_foreign_keys" -- see 20260909050000_core_unindexed_fkeys.sql's
-- own header for the full rationale; this is the inventory-schema half of the same finding.
create index if not exists stock_transfer_items_item_id_idx on inventory.stock_transfer_items (item_id);
create index if not exists stock_transfers_destination_warehouse_id_idx on inventory.stock_transfers (destination_warehouse_id);
create index if not exists stock_transfers_source_warehouse_id_idx on inventory.stock_transfers (source_warehouse_id);
