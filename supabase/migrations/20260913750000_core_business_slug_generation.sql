-- Generates a new business's slug at the same place its core.business_settings row
-- already gets created -- core.handle_new_business(), the AFTER INSERT trigger on
-- core.businesses added in the platform's original core schema migration. Extracted into
-- its own function (rather than inlined into the trigger body) so the exact same
-- collision-safe, reserved-word-safe algorithm 20260913740000's one-time backfill used by
-- hand is the one and only place that logic lives going forward -- every future business,
-- from every creation path (packages/module-discovery/src/lib/tenancy/mutations.ts's
-- createBusiness(), and any other future caller of `insert into core.businesses`), gets a
-- slug for free without that code needing to know slugs exist at all.
create function core.generate_business_slug(business_name text)
returns text
language plpgsql
security definer
set search_path = core
as $$
declare
  reserved text[] := array[
    'dashboard', 'platform', 'login', 'signup', 'forgot-password', 'reset-password',
    'onboarding', 'auth', 'api', 'p'
  ];
  candidate text;
  final_slug text;
  suffix int;
begin
  candidate := trim(both '-' from regexp_replace(lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g')), '-{2,}', '-', 'g'));
  if candidate = '' or candidate = any(reserved) then
    candidate := coalesce(nullif(candidate, ''), 'business') || '-business';
  end if;

  final_slug := candidate;
  suffix := 1;
  while exists (select 1 from core.business_settings where slug = final_slug) loop
    suffix := suffix + 1;
    final_slug := candidate || '-' || suffix;
  end loop;

  return final_slug;
end;
$$;

revoke execute on function core.generate_business_slug(text) from public, anon, authenticated;

create or replace function core.handle_new_business()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  insert into core.business_settings (business_id, slug)
  values (new.id, core.generate_business_slug(new.name))
  on conflict (business_id) do nothing;
  return new;
end;
$$;
