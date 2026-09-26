-- RBAC-19 -- a read-only role is read-only on the shared `core` records too
-- (docs/plan/15-MULTI-USER-RBAC-BACKLOG.md §4, §49, §55 "Viewer -> read-only").
--
-- Module tables got this through core.write_licensed_business_ids() (20260926150000). The
-- shared core tables (parties, items, documents, payments, tags, ...) check tenancy with
-- core.user_business_ids() directly in every write policy, so a viewer could still write
-- them. Every such write policy now checks core.user_write_business_ids() instead: the
-- same businesses, minus those where the caller's role holds no write permission.
--
-- Rewritten in place (ALTER POLICY) from the live definitions rather than re-typed, so
-- nothing else about any policy changes. Left alone on purpose:
--   business_members, business_settings -- handled explicitly in 20260926150000;
--   ai_runs, domain_events, export_jobs -- written as a side effect of reading/exporting
--   (AI analysis, event publishing, export jobs gated by the *.export permissions).

create or replace function core.user_write_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select b from core.user_business_ids() b where core.has_write_capability(b);
$$;
revoke execute on function core.user_write_business_ids() from public, anon;
grant execute on function core.user_write_business_ids() to authenticated, service_role;

do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'core'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and tablename not in ('business_members', 'business_settings', 'ai_runs', 'domain_events', 'export_jobs')
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%core.user_business_ids()%'
  loop
    v_using := replace(p.qual, 'core.user_business_ids()', 'core.user_write_business_ids()');
    v_check := replace(p.with_check, 'core.user_business_ids()', 'core.user_write_business_ids()');
    v_sql := format('alter policy %I on core.%I', p.policyname, p.tablename);
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;
    execute v_sql;
  end loop;
end;
$$;
