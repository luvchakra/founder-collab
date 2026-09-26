-- BILL-01 (security finding) -- a business's plan can no longer be changed by its members.
--
-- core.business_settings.plan (FK to platform.plans.key, 20260912070000) decides which
-- features and quantity limits a business gets (entitlements/plan-lookup.ts,
-- core.try_consume_usage_counter). But "members can update their business settings"
-- (20260906095000) lets any member UPDATE the row, with no column restriction -- so any
-- member could set plan = 'max' straight through PostgREST and lift every limit, paid for
-- by nobody. The plan is a billing fact: from now on only billing (the subscription
-- provisioning service, running as the service role) and SECURITY DEFINER functions may
-- change it.
--
-- A trigger rather than column-level privileges: revoking UPDATE on one column means
-- re-granting every other column by name, and every future column would then be silently
-- read-only for members until someone remembered to grant it. The trigger only looks at
-- the one column that matters.

create or replace function core.guard_business_settings_plan()
returns trigger
language plpgsql
set search_path = core
as $$
begin
  -- current_user is the requesting role for a PostgREST call from a signed-in user, and
  -- the function owner inside a SECURITY DEFINER function -- so billing's service-role
  -- writes and definer functions pass, a member's direct write does not.
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.plan is distinct from 'free' then
      raise exception 'A business plan can only be set by billing.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.plan is distinct from old.plan then
      raise exception 'A business plan can only be changed by billing.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists business_settings_plan_guard on core.business_settings;
create trigger business_settings_plan_guard
  before insert or update on core.business_settings
  for each row execute function core.guard_business_settings_plan();
