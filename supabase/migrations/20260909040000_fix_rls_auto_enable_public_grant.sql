-- Corrects the previous migration's own incomplete fix: `public.rls_auto_enable()`'s
-- EXECUTE grant turned out to be to `PUBLIC` (the implicit pseudo-role every role
-- inherits from), not directly to `anon`/`authenticated` -- confirmed via
-- `information_schema.routine_privileges` after `20260909030000`'s own
-- `revoke ... from anon, authenticated` left both roles still able to execute it
-- (`revoke ... from <role>` is a no-op against a grant that was never made to that role
-- directly; it has to be revoked from `public` itself). This is the same "first attempt
-- turned out incomplete, corrected in a separate follow-up rather than editing the
-- already-applied migration" pattern this platform already used for the compat-view
-- tax-fields fix (see docs/PORT-PROVENANCE.md).
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public;
  end if;
end $$;
