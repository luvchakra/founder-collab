-- Fixes a real production bug found 2026-09-07: every prior migration in this timeline
-- assumed `core`/`discovery`/`inventory` behaved like Supabase's built-in `public` schema,
-- which the platform bootstraps with GRANT USAGE + table privileges to `anon`/
-- `authenticated` automatically. A schema created by our own migrations gets no such
-- automatic grant -- PostgREST being told the schema is exposed (the Data API "Exposed
-- schemas" setting) only lets it route a request there; the underlying `authenticated`
-- database role still needs USAGE on the schema and SELECT/INSERT/UPDATE/DELETE on its
-- tables before Postgres will let a query run at all, prior to RLS ever being evaluated.
--
-- Every RLS test in this repo passed throughout Epic 2-4 because the shared test harness
-- (scripts/lib/rls-test-harness.mjs) issues these exact grants itself as part of each
-- test's setup (see supabase/tests/local-stub.sql and every test-*.mjs's own `grant usage
-- on schema core to authenticated; grant select, insert, update, delete on all tables in
-- schema core to authenticated;` boilerplate) -- masking the gap in every migration file
-- itself. It surfaced only once real user traffic hit the actual dev Supabase project
-- (`permission denied for schema core`, error 42501), which never had this grant.
--
-- `alter default privileges` covers every future table `create table` adds to these
-- schemas without needing a fresh grant statement per story -- matching the schemas as
-- they were on the day this migration runs, plus everything after.
--
-- No `anon` grant: every route these schemas back is behind a login redirect
-- (`if (!user) redirect("/login")`), and RLS on every table already resolves through
-- `auth.uid()`, which is null for `anon` -- an anonymous grant would be exercised by
-- nothing legitimate. `service_role` already bypasses RLS (BYPASSRLS), but still needs
-- the same schema/table grants to be usable at all from the admin client
-- (packages/core/src/db/admin.ts) and the cron drain route.

grant usage on schema core to authenticated, service_role;
grant usage on schema discovery to authenticated, service_role;
grant usage on schema inventory to authenticated, service_role;

grant select, insert, update, delete on all tables in schema core to authenticated, service_role;
grant select, insert, update, delete on all tables in schema discovery to authenticated, service_role;
grant select, insert, update, delete on all tables in schema inventory to authenticated, service_role;

alter default privileges in schema core grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema discovery grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema inventory grant select, insert, update, delete on tables to authenticated, service_role;
