-- Supabase advisor "unindexed_foreign_keys" (NEXT-ACTIVITIES.md §3, "Supabase advisor
-- findings" row): 4 core foreign keys with no covering index, found live via
-- get_advisors(type: "performance"). Plain `create index` (not CONCURRENTLY) is safe
-- here -- every one of these tables is empty or near-empty in dev, so no long-running
-- lock risk; a production rollout of the same set might prefer CONCURRENTLY instead.
create index if not exists item_categories_parent_id_idx on core.item_categories (parent_id);
create index if not exists license_events_module_key_idx on core.license_events (module_key);
create index if not exists licenses_module_key_idx on core.licenses (module_key);
create index if not exists role_permissions_permission_key_idx on core.role_permissions (permission_key);
