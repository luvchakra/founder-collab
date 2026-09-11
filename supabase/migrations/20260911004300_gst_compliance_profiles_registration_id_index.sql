-- Follow-up to 20260911004200_gst_tax_registrations.sql (COMPLY-P0-02.1), found via
-- mcp__Supabase__get_advisors' performance check immediately after applying that
-- migration live: the `compliance_profiles_registration_id_fkey` foreign key that
-- migration added had no covering index. Every business/tenant-scoped FK in this
-- platform gets one (CLAUDE.md's own convention, restated in this run's instructions) --
-- this isn't `gst.compliance_profiles`'s own tenant FK (that's still `business_id`, its
-- primary key, already indexed by being one), but it is a real FK that needed its own
-- index regardless. Kept as its own migration file, not folded back into
-- 20260911004200, so this repo's `supabase/migrations/` timeline matches exactly what
-- was actually applied to the dev project, one file per `apply_migration` call -- the
-- same "separate follow-up file, not a silent edit of an already-applied migration"
-- pattern `20260909010000_gst_credentials_encrypt_secrets.sql` already established.

create index compliance_profiles_registration_id_idx on gst.compliance_profiles (registration_id);
