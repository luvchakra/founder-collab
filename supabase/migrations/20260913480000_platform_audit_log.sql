-- PLATFORM-P0-16.1/16.2/16.3 ("Platform Audit", docs/plan/09-PLATFORM-ADMIN-PORTAL-
-- BACKLOG.md §20). See this story's own dated entry in
-- docs/design/platform-admin-portal-audit.md for the full reasoning; summarized here.
--
-- **Entity-ownership / "already built?" check, done first** (per this run's own task
-- brief -- "Platform Audit" could mean the already-built PLATFORM-P0-17 Configuration
-- Versioning, or something distinct): read `config-history.ts`'s own docstring in full.
-- That story's eleven `platform.*_events` tables already give per-resource, JSONB-
-- snapshot change history for the ELEVEN resource types that had one -- but §20's own
-- text asks for something broader and genuinely NOT built yet:
--   - 16.1 "every platform mutation" -- several real `platform.*` tables have NO audit
--     trail at all today (checked live: `compliance_countries`/`compliance_packs`/
--     `compliance_pack_features`, `plan_features`/`plan_limits`/`plan_modules` all mutate
--     via a plain RLS-gated `.update()`/`.insert()`/`.delete()`, no `*_events` sibling,
--     no `reason` capture -- confirmed by reading every one of their migrations, not
--     assumed). Two of these gaps are explicitly named in 16.2's own mandatory list
--     below ("entitlement changes" = plan_features/plan_limits/plan_modules,
--     "compliance rule changes" = compliance_countries/packs/pack_features) -- a real,
--     concrete hole this story closes, not a duplicate of 17's work.
--   - 16.3 "Audit Search" with a `severity` filter -- no resource type anywhere in this
--     codebase has a severity concept, and there is no single place to search across all
--     eleven existing `*_events` tables plus these new gaps at once. Genuinely new.
--   - 16.4 "Configuration History" -- this is fully satisfied by PLATFORM-P0-17 already
--     (`config-history.ts` + `/platform/config-history`). No new work; the Audit Search
--     page this story adds links to it rather than re-implementing it.
-- Conclusion: distinct from, and complementary to, Configuration Versioning -- built as
-- new work below, reusing 17's own tables/read-layer everywhere it already exists rather
-- than re-deriving it (`packages/core/src/admin/platform-audit-log.ts`'s own docstring
-- explains how the read side merges both).
--
-- **Why one generic `platform.audit_log` table instead of six more bespoke `*_events`
-- tables** (one per newly-covered resource type, matching the pre-existing pattern
-- exactly): 16.1's own text asks for "every platform mutation" to land in one auditable
-- place with one uniform shape (actor/action/resource/resource_id/old_value/new_value/
-- timestamp/reason) -- that is a generic log, not eleven more one-off tables. The
-- pre-existing `*_events` tables were each bolted on individually, table by table, as
-- their own story shipped, before this dedicated "Platform Audit" story existed to unify
-- the concept -- this table is that unification for every mutation gaining coverage from
-- here on, without retrofitting the eleven that already have their own home (no data
-- migration, no double-logging).
--
-- **Why triggers, not converting these six tables to SECURITY DEFINER
-- create_x()/update_x() functions** (the pattern `platform.plan_events`'s own migration
-- used for `platform.plans`): that conversion also tightens RLS (drops the direct
-- insert/update policies, adds a mandatory `reason` argument), which is a real behavior
-- change to six already-shipped admin UIs (PLATFORM-P0-04.4/04.5/04.6/13.1/13.2/13.4) --
-- every mutating call site would need a new required "reason" field added to its form.
-- None of those forms collect a reason today, and inventing one now, for six pages at
-- once, in a story whose own text never asks for a reason requirement (16.1 doesn't list
-- "reason" as mandatory the way 16.2's "mandatory audit for..." list does for the audit
-- *record* -- these mutations simply have no reason to record yet) would be exactly the
-- kind of speculative UI change CLAUDE.md development principle #7 rules out, and doing
-- it for six pages in one sitting risks a subtly wrong refactor of already-tested,
-- already-shipped features (CLAUDE.md workflow rule: don't refactor unrelated code).
-- A plain `AFTER INSERT OR UPDATE OR DELETE` trigger per table, writing into the new
-- unified log via `write_platform_audit_log()`, gets 16.1's actor/action/resource/
-- resource_id/old_value/new_value/timestamp automatically, with zero change to any
-- existing RLS policy, grant, TypeScript mutation function, or UI -- this is exactly the
-- shape `core.audit_log`'s own `log_document_status_change()`/
-- `log_business_settings_change()` triggers already established (see
-- `20260906109000_core_audit_log.sql`), just applied inside `platform` instead of `core`.
-- `reason` is simply NULL for every trigger-captured row (there is nothing to record);
-- the six existing "reason required" `*_events` tables are untouched and keep their own
-- bar exactly as-is.
--
-- **Severity (16.2's own filter)**: computed once per resource type, not stored as a
-- superadmin-editable field (no story anywhere asks an admin to grade their own action's
-- severity, and letting them would undercut the point of an immutable audit trail).
-- `platform-audit-log.ts` holds the full mapping/reasoning for all seventeen resource
-- types (six new + eleven existing); the two families this migration adds are both 'high'
-- because they are named verbatim in 16.2's own mandatory list ("entitlement changes",
-- "compliance rule changes").
--
-- **IP/device metadata (16.1's own "where appropriate")**: nullable columns exist below
-- so the shape is ready, but neither this migration's triggers nor any new mutation path
-- this story adds populates them. A Postgres trigger has no access to the HTTP request at
-- all (it only sees the already-authenticated SQL session), and the one real avenue --
-- reading PostgREST's own `request.header.*` session GUCs via `current_setting()` -- has
-- no precedent anywhere in this codebase, was never verified end-to-end (through
-- Vercel's own proxy chain, `@supabase/ssr`'s server client, to Supabase's PostgREST) for
-- this run, and would show the network hop's IP, not reliably the superadmin's own
-- device, if it worked at all. Recording a plausible-looking but unverified IP in a
-- security audit log is worse than recording none -- CLAUDE.md's "stop and report a
-- genuine judgment call rather than guess" bar applies to shipping a half-verified
-- security field, not just to authorization logic. Left for a follow-up story that can
-- verify the GUC end-to-end (or add IP capture in the Next.js server-action layer
-- instead, threading it through as an explicit parameter) rather than guessed at here.
--
-- **Deliberately NOT covered this story** (every other currently-unaudited `platform.*`
-- mutation path, checked and named rather than silently missed):
--   - `platform.branding`, `platform.notification_policies`, `platform.features` (the
--     definitional catalog, not `plan_features`), `platform.modules.visible`/`.version`
--     (`setModuleVisible`/`setModuleVersion` -- see that file's own docstring: deliberately
--     unaudited by PLATFORM-P0-07.3's own design, no real-world access effect) -- none of
--     these are named in 16.2's own mandatory list, and CLAUDE.md development principle #7
--     ("never implement speculative functionality — build only what the current story
--     requires") is the reason to stop at 16.2's literal list rather than sweep every
--     un-audited table into scope in one migration.
--   - `platform.admins` (SUPERADMIN grant/revoke) -- there is no application-layer
--     mutation path to it at all yet (checked: no `grant_superadmin`/`revoke_superadmin`
--     function or caller exists anywhere in `packages/core`/`apps/web`) -- membership is
--     still managed out-of-band. Nothing to instrument.
--   - "impersonation" (16.2's own list) -- `PLATFORM-P1-03.3` ("Safe Impersonation") is a
--     P1 story not yet built (confirmed by grep: no impersonation code anywhere in this
--     repo). Auditing a feature that doesn't exist is impossible; when it ships, its own
--     mutation path calls `write_platform_audit_log()` the same way these six do.
create table platform.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  resource_type text not null,
  resource_id text,
  severity text not null check (severity in ('normal', 'high')),
  reason text,
  previous_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  performed_at timestamptz not null default now()
);

create index audit_log_performed_at_idx on platform.audit_log (performed_at desc);
create index audit_log_actor_id_idx on platform.audit_log (actor_id);
create index audit_log_resource_type_idx on platform.audit_log (resource_type);
create index audit_log_severity_idx on platform.audit_log (severity);

alter table platform.audit_log enable row level security;

-- Same trust level as every sibling `*_events` table: superadmin-only SELECT, no direct
-- write grant to `authenticated` at all -- `write_platform_audit_log()` (SECURITY
-- DEFINER, below) is the one path to a row, called only from this migration's own
-- triggers today.
create policy "superadmins can view platform audit log" on platform.audit_log
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.audit_log to authenticated;
grant all on platform.audit_log to service_role;

create function platform.write_platform_audit_log(
  p_actor_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_severity text,
  p_reason text,
  p_previous_value jsonb,
  p_new_value jsonb
)
returns uuid
language sql
security definer
set search_path = platform
as $$
  insert into platform.audit_log (
    actor_id, action, resource_type, resource_id, severity, reason, previous_value, new_value
  )
  values (
    p_actor_id, p_action, p_resource_type, p_resource_id, p_severity, p_reason, p_previous_value, p_new_value
  )
  returning id;
$$;

-- No grant to `authenticated` (or `anon`) at all -- unlike `core.write_audit_log()`,
-- nothing in `apps/web`/`packages/core` calls this directly; only this migration's own
-- SECURITY DEFINER trigger functions below do, and a SECURITY DEFINER function executes
-- with its OWNER's privileges for every call it makes internally (including to this
-- function), so it needs no grant of its own to run. Granting EXECUTE to `authenticated`
-- here would let ANY signed-in user call it directly and forge an arbitrary audit_log row
-- (any actor_id, any resource_type, any severity) -- confirmed exploitable during this
-- story's own role-switched verification before this line was corrected to omit the
-- grant; see this story's own dated audit-log entry.
revoke execute on function platform.write_platform_audit_log(uuid, text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- platform.compliance_countries / compliance_packs / compliance_pack_features
-- ("compliance rule changes", 16.2's own mandatory list -- severity 'high').
-- ---------------------------------------------------------------------------------------

create function platform.log_compliance_country_audit()
returns trigger
language plpgsql
security definer
set search_path = platform
as $$
begin
  if TG_OP = 'DELETE' then
    perform platform.write_platform_audit_log(auth.uid(), 'deleted', 'compliance_country', OLD.country_code, 'high', null, to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    perform platform.write_platform_audit_log(auth.uid(), 'updated', 'compliance_country', NEW.country_code, 'high', null, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    perform platform.write_platform_audit_log(auth.uid(), 'created', 'compliance_country', NEW.country_code, 'high', null, null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

create trigger compliance_countries_audit
  after insert or update or delete on platform.compliance_countries
  for each row execute function platform.log_compliance_country_audit();

create function platform.log_compliance_pack_audit()
returns trigger
language plpgsql
security definer
set search_path = platform
as $$
begin
  if TG_OP = 'DELETE' then
    perform platform.write_platform_audit_log(auth.uid(), 'deleted', 'compliance_pack', OLD.id::text, 'high', null, to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    perform platform.write_platform_audit_log(auth.uid(), 'updated', 'compliance_pack', NEW.id::text, 'high', null, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    perform platform.write_platform_audit_log(auth.uid(), 'created', 'compliance_pack', NEW.id::text, 'high', null, null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

create trigger compliance_packs_audit
  after insert or update or delete on platform.compliance_packs
  for each row execute function platform.log_compliance_pack_audit();

create function platform.log_compliance_pack_feature_audit()
returns trigger
language plpgsql
security definer
set search_path = platform
as $$
begin
  if TG_OP = 'DELETE' then
    perform platform.write_platform_audit_log(auth.uid(), 'deleted', 'compliance_pack_feature', OLD.id::text, 'high', null, to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    perform platform.write_platform_audit_log(auth.uid(), 'updated', 'compliance_pack_feature', NEW.id::text, 'high', null, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    perform platform.write_platform_audit_log(auth.uid(), 'created', 'compliance_pack_feature', NEW.id::text, 'high', null, null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

create trigger compliance_pack_features_audit
  after insert or update or delete on platform.compliance_pack_features
  for each row execute function platform.log_compliance_pack_feature_audit();

-- ---------------------------------------------------------------------------------------
-- platform.plan_features / plan_limits / plan_modules ("entitlement changes", 16.2's own
-- mandatory list -- severity 'high'). All three have composite primary keys -- resource_id
-- is the two key columns joined with ':' so Audit Search still has one stable string to
-- filter/display on.
-- ---------------------------------------------------------------------------------------

create function platform.log_plan_feature_audit()
returns trigger
language plpgsql
security definer
set search_path = platform
as $$
begin
  if TG_OP = 'DELETE' then
    perform platform.write_platform_audit_log(auth.uid(), 'deleted', 'plan_feature', OLD.plan_id::text || ':' || OLD.feature_id::text, 'high', null, to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    perform platform.write_platform_audit_log(auth.uid(), 'updated', 'plan_feature', NEW.plan_id::text || ':' || NEW.feature_id::text, 'high', null, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    perform platform.write_platform_audit_log(auth.uid(), 'created', 'plan_feature', NEW.plan_id::text || ':' || NEW.feature_id::text, 'high', null, null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

create trigger plan_features_audit
  after insert or update or delete on platform.plan_features
  for each row execute function platform.log_plan_feature_audit();

create function platform.log_plan_limit_audit()
returns trigger
language plpgsql
security definer
set search_path = platform
as $$
begin
  if TG_OP = 'DELETE' then
    perform platform.write_platform_audit_log(auth.uid(), 'deleted', 'plan_limit', OLD.plan_id::text || ':' || OLD.resource_key, 'high', null, to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    perform platform.write_platform_audit_log(auth.uid(), 'updated', 'plan_limit', NEW.plan_id::text || ':' || NEW.resource_key, 'high', null, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    perform platform.write_platform_audit_log(auth.uid(), 'created', 'plan_limit', NEW.plan_id::text || ':' || NEW.resource_key, 'high', null, null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

create trigger plan_limits_audit
  after insert or update or delete on platform.plan_limits
  for each row execute function platform.log_plan_limit_audit();

create function platform.log_plan_module_audit()
returns trigger
language plpgsql
security definer
set search_path = platform
as $$
begin
  if TG_OP = 'DELETE' then
    perform platform.write_platform_audit_log(auth.uid(), 'deleted', 'plan_module', OLD.plan_id::text || ':' || OLD.module_key, 'high', null, to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    perform platform.write_platform_audit_log(auth.uid(), 'updated', 'plan_module', NEW.plan_id::text || ':' || NEW.module_key, 'high', null, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    perform platform.write_platform_audit_log(auth.uid(), 'created', 'plan_module', NEW.plan_id::text || ':' || NEW.module_key, 'high', null, null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

create trigger plan_modules_audit
  after insert or update or delete on platform.plan_modules
  for each row execute function platform.log_plan_module_audit();
