-- PLATFORM-P0-10.4 ("AI Feature Kill Switch", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §14): "Disable a specific AI feature globally without disabling the entire module."
--
-- An "AI feature" is one entry in packages/core/src/ai/operation-registry.ts (`AiOperation`
-- -- chat, research_prospect, draft_review_response, ...). Every AI call on the platform
-- resolves its model through one of the two routers (core's business-router.ts and
-- module-discovery's router.ts), each of which takes the operation name, so a per-operation
-- switch checked there stops exactly that feature everywhere without touching the module's
-- licence or any other AI feature.
--
-- One row per operation that has ever been switched; no row = enabled (the safe default
-- for an operation added to the registry after this migration). Distinct from
-- platform.ai_feature_policies.ai_enabled, which is the platform-wide "all AI" policy.
--
-- Writes go through set_ai_operation_enabled() only: superadmin-checked, reason required,
-- and recorded in platform.audit_log (PLATFORM-P0-16.1) with before/after values.

create table platform.ai_operation_switches (
  operation text primary key check (operation ~ '^[a-z0-9_]+$'),
  enabled boolean not null default true,
  reason text not null check (btrim(reason) <> ''),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index ai_operation_switches_updated_by_idx on platform.ai_operation_switches (updated_by);

alter table platform.ai_operation_switches enable row level security;

-- Any signed-in user may read which AI features are switched off (the routers run with
-- the caller's session and need to know); nothing here is sensitive.
create policy "signed-in users can read ai operation switches" on platform.ai_operation_switches
  for select to authenticated using (true);

grant select on platform.ai_operation_switches to authenticated;
grant all on platform.ai_operation_switches to service_role;

create function platform.set_ai_operation_enabled(p_operation text, p_enabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before platform.ai_operation_switches;
  v_after platform.ai_operation_switches;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can switch an AI feature.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  if p_operation is null or p_operation !~ '^[a-z0-9_]+$' then
    raise exception 'Unknown AI operation.';
  end if;

  select * into v_before from platform.ai_operation_switches where operation = p_operation for update;

  insert into platform.ai_operation_switches (operation, enabled, reason, updated_by, updated_at)
  values (p_operation, p_enabled, btrim(p_reason), auth.uid(), now())
  on conflict (operation) do update
    set enabled = excluded.enabled, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v_after;

  perform platform.write_platform_audit_log(
    auth.uid(),
    case when v_before.operation is null then 'created' else 'updated' end,
    'ai_operation_switch',
    p_operation,
    'high',
    btrim(p_reason),
    case when v_before.operation is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after)
  );
end;
$$;

revoke execute on function platform.set_ai_operation_enabled(text, boolean, text) from public, anon;
grant execute on function platform.set_ai_operation_enabled(text, boolean, text) to authenticated;
