-- Fixes a real regression from 20260913740000 (business_settings.slug NOT NULL):
-- Postgres validates NOT NULL constraints on an INSERT's candidate row during tuple
-- formation, *before* it ever checks whether the row conflicts with an existing one --
-- so `insert into core.business_settings (business_id, <other column>) values (...) on
-- conflict (business_id) do update ...` fails with a NOT NULL violation on slug even
-- when a row already exists with a real slug, because the statement's own column list
-- never mentions slug at all. This is not a hypothetical: module-gst's own
-- upsertGstProfile() (packages/module-gst/src/lib/profile/mutations.ts) does exactly
-- this shape via Supabase's `.upsert()`, and broke the moment slug became NOT NULL.
--
-- The robust fix lives on the table itself, not at each caller: a BEFORE INSERT trigger
-- fills in slug (via the same core.generate_business_slug() every other path already
-- uses) whenever a row is inserted without one -- before the NOT NULL check runs, and
-- regardless of which of business_settings' many callers (present or future) the insert
-- came from. core.handle_new_business() no longer needs to generate the slug itself as
-- a result; it goes back to the same plain "ensure a row exists" insert
-- 20260912070000 originally gave it, with this new trigger picking up the slug.
create function core.ensure_business_settings_slug()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  business_name text;
begin
  if new.slug is null then
    select name into business_name from core.businesses where id = new.business_id;
    new.slug := core.generate_business_slug(coalesce(business_name, 'business'));
  end if;
  return new;
end;
$$;

revoke execute on function core.ensure_business_settings_slug() from public, anon, authenticated;

create trigger business_settings_ensure_slug
  before insert on core.business_settings
  for each row execute function core.ensure_business_settings_slug();

create or replace function core.handle_new_business()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  insert into core.business_settings (business_id)
  values (new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;
