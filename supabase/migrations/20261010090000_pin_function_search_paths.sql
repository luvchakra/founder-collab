-- Pin search_path on the three functions Supabase's security advisor still flags
-- (function_search_path_mutable). An unpinned search_path lets whoever calls a function
-- decide which schema an unqualified name resolves to. All three are pure expressions over
-- their own arguments -- they reference no tables or other functions by name -- so an empty
-- search_path (pg_catalog is always searched) changes nothing about what they return.
-- scripts/test-function-search-paths.mjs keeps every platform function pinned from here on.

alter function core.module_view_permission(text) set search_path = '';
alter function core.is_read_only_permission(text) set search_path = '';
alter function platform.billing_provider_snapshot(platform.billing_providers) set search_path = '';
