-- RBAC-27 -- `/invite/[token]` is a real top-level route (invitation acceptance), so
-- `invite` joins the reserved slugs in all three places the list lives: the middleware's
-- RESERVED_TOP_SEGMENTS (same commit), the CHECK constraint and
-- core.generate_business_slug(). Same shape as 20260926090000.
update core.business_settings
set slug = slug || '-business'
where slug = 'invite'
  and not exists (select 1 from core.business_settings other where other.slug = 'invite-business');

alter table core.business_settings
  drop constraint if exists business_settings_slug_not_reserved;

alter table core.business_settings
  add constraint business_settings_slug_not_reserved check (
    slug not in (
      'dashboard', 'platform', 'login', 'signup', 'forgot-password', 'reset-password',
      'onboarding', 'auth', 'api', 'p', 'help', 'terms', 'privacy', 'pricing', 'invite'
    )
  );

create or replace function core.generate_business_slug(business_name text)
returns text
language plpgsql
security definer
set search_path = core
as $$
declare
  reserved text[] := array[
    'dashboard', 'platform', 'login', 'signup', 'forgot-password', 'reset-password',
    'onboarding', 'auth', 'api', 'p', 'help', 'terms', 'privacy', 'pricing', 'invite'
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
