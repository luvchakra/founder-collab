-- Promotes core.business_settings.slug (added nullable in 20260906095000, so far only
-- populated by module-fsm's public work-request contact form -- resolveContactFormBusiness
-- in packages/module-fsm/src/lib/work-requests/queries.ts) into the one canonical business
-- slug: every business-scoped dashboard URL now resolves through it too
-- (packages/core/src/businesses/resolve.ts), replacing the raw business_id UUID that used
-- to sit in the URL under /dashboard/businesses/[businessId]/... . One slug, two consumers
-- -- not a second, parallel slug concept -- per CLAUDE.md non-negotiable #5's "use the
-- canonical thing, don't create a parallel one."

-- Backfill every business lacking a slug yet (every business except whichever already set
-- one via the contact-form feature) from its own name: lowercased, non-alphanumeric runs
-- collapsed to a single hyphen, leading/trailing hyphens trimmed. Collisions (including
-- against an already-populated slug) get a numeric suffix; a business slug is never
-- allowed to collide with one of the app's own static top-level routes, since the
-- middleware route guard (packages/core/src/db/middleware.ts) tells a business-slug
-- segment apart from those by name, not by position.
do $$
declare
  reserved text[] := array[
    'dashboard', 'platform', 'login', 'signup', 'forgot-password', 'reset-password',
    'onboarding', 'auth', 'api', 'p'
  ];
  r record;
  candidate text;
  final_slug text;
  suffix int;
begin
  for r in
    select bs.business_id, b.name
    from core.business_settings bs
    join core.businesses b on b.id = bs.business_id
    where bs.slug is null
    order by b.created_at
  loop
    candidate := trim(both '-' from regexp_replace(lower(regexp_replace(r.name, '[^a-zA-Z0-9]+', '-', 'g')), '-{2,}', '-', 'g'));
    if candidate = '' or candidate = any(reserved) then
      candidate := coalesce(nullif(candidate, ''), 'business') || '-business';
    end if;

    final_slug := candidate;
    suffix := 1;
    while exists (select 1 from core.business_settings where slug = final_slug) loop
      suffix := suffix + 1;
      final_slug := candidate || '-' || suffix;
    end loop;

    update core.business_settings set slug = final_slug where business_id = r.business_id;
  end loop;
end $$;

alter table core.business_settings alter column slug set not null;

-- Defense in depth (app-level slug generation, packages/core/src/businesses/resolve.ts,
-- already guarantees both of these) -- matches this codebase's existing pattern of
-- enforcing tenant/format invariants at the database layer, not just in application code.
alter table core.business_settings
  add constraint business_settings_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table core.business_settings
  add constraint business_settings_slug_not_reserved check (
    slug not in (
      'dashboard', 'platform', 'login', 'signup', 'forgot-password', 'reset-password',
      'onboarding', 'auth', 'api', 'p'
    )
  );
