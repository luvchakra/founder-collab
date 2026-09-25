-- `/terms`, `/privacy` and `/pricing` are now real, public top-level routes (the legal
-- pages and the plan catalogue), so none of the three can be a business slug any more:
-- the middleware tells a business-scoped URL from a static one by whether the first
-- segment is in its reserved list, and a business slugged `pricing` would have its whole
-- workspace shadowed by the public page.
--
-- Same three copies of the list as 20260918150000 (which reserved `help` the same way):
-- the middleware's RESERVED_TOP_SEGMENTS, the CHECK constraint below, and
-- core.generate_business_slug(). This migration moves the two database copies; the
-- middleware's was changed in the same commit. `robots.txt` and `sitemap.xml` are in the
-- middleware's list too but need nothing here -- business_settings_slug_format allows no
-- dots, so neither can ever be a slug.

-- No business on the dev project uses any of them (checked before writing this), but a
-- deployment that does would fail the new constraint and take the migration down with
-- it. Rename first, by the same convention generate_business_slug() already uses for a
-- name that collides with a reserved word.
update core.business_settings
set slug = slug || '-business'
where slug in ('terms', 'privacy', 'pricing')
  and not exists (
    select 1 from core.business_settings other
    where other.slug = core.business_settings.slug || '-business'
  );

alter table core.business_settings
  drop constraint if exists business_settings_slug_not_reserved;

alter table core.business_settings
  add constraint business_settings_slug_not_reserved check (
    slug not in (
      'dashboard', 'platform', 'login', 'signup', 'forgot-password', 'reset-password',
      'onboarding', 'auth', 'api', 'p', 'help', 'terms', 'privacy', 'pricing'
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
    'onboarding', 'auth', 'api', 'p', 'help', 'terms', 'privacy', 'pricing'
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
