-- Fixes a real production bug found 2026-09-07: creating a business calls
-- activateLicense() -> replayParkedEvents() (packages/core/src/licensing/lifecycle.ts,
-- packages/core/src/events/drain.ts), which runs on the admin/service-role client
-- (no signed-in user context for a cron-style operation) and calls
-- core.replay_parked_events() via `.rpc(...)`. Every `grant execute on function ...`
-- statement in this migration timeline (D-9's replay_parked_events/
-- record_domain_event_attempt, C-3's has_module, etc.) only ever granted execute to
-- `authenticated` -- reasonable for functions a signed-in user's own session calls
-- directly, but `service_role` needs the exact same grant for the handful of functions
-- our own trusted server-only admin-client code calls (drain.ts's has_module,
-- record_domain_event_attempt, and replay_parked_events today; more may be added later).
--
-- Unlike table privileges, `service_role`'s BYPASSRLS attribute does NOT imply function
-- EXECUTE privilege -- RLS bypass and object privilege are two separate Postgres
-- mechanisms. This is the same class of gap the previous grants migration
-- (20260907120000_grant_schema_privileges.sql) fixed for schema USAGE and table
-- SELECT/INSERT/UPDATE/DELETE; that migration's own docstring explains why local tests
-- never caught this either (the test harness grants broadly to `service_role` in its own
-- setup, masking the gap in the migrations themselves).
--
-- Blanket-granting EXECUTE on every function in these schemas to `service_role` (rather
-- than hand-picking which ones the admin client happens to call today) matches Supabase's
-- own default behavior for the `public` schema and mirrors the previous migration's own
-- table-level grant, which is already this broad for the same trusted-server-code reason
-- (CLAUDE.md: "Trust internal code and framework guarantees"). `alter default privileges`
-- covers every future function these schemas add without needing a fresh grant per story.

grant execute on all functions in schema core to service_role;
grant execute on all functions in schema discovery to service_role;
grant execute on all functions in schema inventory to service_role;

alter default privileges in schema core grant execute on functions to service_role;
alter default privileges in schema discovery grant execute on functions to service_role;
alter default privileges in schema inventory grant execute on functions to service_role;
