-- Drops two genuinely dead tables, found during a dead-code sweep (2026-09-09):
-- `inventory.demo_seed_batches`/`inventory.demo_seed_records` were pre-scaffolded in
-- `20260906110000_inventory_schema.sql` ahead of the admin demo-seed-tool story ("ported
-- alongside it in a future SP-7 sub-story", per that migration's own comment) but when
-- that story actually landed (`20260907190000_admin_demo_seed_tool.sql`), it built a
-- generic, cross-module version instead -- `core.demo_seed_batches`/
-- `core.demo_seed_records`, explicitly "reusable by any module's seeder, not just
-- module-inventory's" (packages/core/src/admin/demo-seed-tracking.ts's own docstring).
-- The inventory-schema originals were never wired to anything and never removed.
--
-- Confirmed dead before writing this, not assumed: grepped every migration, every
-- package, and every script for `inventory.demo_seed_batches`/`records` -- the only
-- hits outside their own creating migration were `scripts/test-inventory-rls.mjs`'s own
-- RLS assertions against them (updated in the same commit to test `core`'s real tables
-- instead) and this migration itself. Zero rows in the dev project (confirmed via
-- Supabase MCP) and zero application code ever selects, inserts, or references them.
drop table if exists inventory.demo_seed_records;
drop table if exists inventory.demo_seed_batches;
