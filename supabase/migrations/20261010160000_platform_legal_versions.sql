-- PLATFORM-P1-09.1 (Terms & Privacy Version) and PLATFORM-P1-09.4 (Policy Acceptance
-- Tracking), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §31.
--
-- 09.1  platform.legal_document_versions: each published version of the Terms of Service or
--       the Privacy Policy -- a label, what changed, whether users must accept it again, and
--       a SHA-256 of the text the app serves (apps/web/lib/legal-content.ts) at the moment it
--       was published, so the admin page can say when the live text no longer matches the
--       active version. The active version of a document is its newest row. Published only
--       through publish_legal_document_version() by a superadmin; never edited or deleted;
--       every publish lands in platform.audit_log.
-- 09.4  platform.policy_acceptances: which user accepted which version, when, and how
--       (at signup, or from the accept prompt). A user accepts only for themselves, through
--       accept_legal_document_versions(); signup is recorded server-side by
--       record_signup_legal_acceptance(), service_role only. A user still has to accept when
--       the active version requires acceptance, or when they have never accepted any
--       version of that document.
--
-- Both are WonderArk's own legal records with its users -- control-plane data, not tenant
-- data -- so they live in `platform`, never gated by core.licenses.

create table platform.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document text not null check (document in ('terms', 'privacy')),
  version text not null check (btrim(version) <> '' and length(version) <= 40),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  summary text not null check (btrim(summary) <> '' and length(summary) <= 500),
  requires_acceptance boolean not null,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (document, version)
);

create index legal_document_versions_active_idx on platform.legal_document_versions (document, published_at desc);

alter table platform.legal_document_versions enable row level security;

-- Which version is in force is public information (the /terms page could show it).
create policy "anyone can view legal document versions" on platform.legal_document_versions
  for select to anon, authenticated
  using (true);

revoke all on platform.legal_document_versions from anon, authenticated;
grant select on platform.legal_document_versions to anon, authenticated;
grant all on platform.legal_document_versions to service_role;

create table platform.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version_id uuid not null references platform.legal_document_versions (id),
  method text not null check (method in ('signup', 'prompt')),
  accepted_at timestamptz not null default now(),
  unique (user_id, version_id)
);

create index policy_acceptances_user_idx on platform.policy_acceptances (user_id);

alter table platform.policy_acceptances enable row level security;

create policy "users can view their own policy acceptances" on platform.policy_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()) or platform.is_superadmin());

revoke all on platform.policy_acceptances from anon, authenticated;
grant select on platform.policy_acceptances to authenticated;
grant all on platform.policy_acceptances to service_role;

-- A published version is a legal record: never edited or deleted, by anyone (service_role
-- bypasses RLS, not triggers). Acceptances are never edited either; they go only when the
-- user's account is deleted (the cascade above).
create function platform.legal_records_are_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'A % row cannot be edited.', tg_table_name;
  end if;
  if tg_table_name = 'legal_document_versions' then
    raise exception 'A published legal document version cannot be deleted.';
  end if;
  return old;
end;
$$;

create trigger legal_document_versions_immutable
  before update or delete on platform.legal_document_versions
  for each row execute function platform.legal_records_are_immutable();

create trigger policy_acceptances_immutable
  before update on platform.policy_acceptances
  for each row execute function platform.legal_records_are_immutable();

create function platform.log_legal_document_version_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.write_platform_audit_log(auth.uid(), 'created', 'legal_document', new.id::text, 'high', new.summary, null, to_jsonb(new));
  return new;
end;
$$;

create trigger legal_document_versions_audit
  after insert on platform.legal_document_versions
  for each row execute function platform.log_legal_document_version_audit();

create function platform.publish_legal_document_version(
  p_document text,
  p_version text,
  p_content_hash text,
  p_summary text,
  p_requires_acceptance boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_summary is null or btrim(p_summary) = '' then
    raise exception 'Say what changed.';
  end if;
  if p_requires_acceptance is null then
    raise exception 'Choose whether users must accept this version.';
  end if;
  if exists (select 1 from platform.legal_document_versions v where v.document = p_document and v.version = btrim(p_version)) then
    raise exception 'Version % already exists for this document.', btrim(p_version);
  end if;
  insert into platform.legal_document_versions (document, version, content_hash, summary, requires_acceptance, published_by)
  values (p_document, btrim(p_version), p_content_hash, btrim(p_summary), p_requires_acceptance, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- The active version of each document, and whether the calling user still has to accept
-- it. Runs as the caller: the policies above show them the versions and their own rows.
create function platform.my_legal_status()
returns table (
  document text,
  version_id uuid,
  version text,
  summary text,
  published_at timestamptz,
  requires_acceptance boolean,
  accepted boolean,
  ever_accepted boolean
)
language sql
stable
set search_path = ''
as $$
  select a.document, a.id, a.version, a.summary, a.published_at, a.requires_acceptance,
    exists (select 1 from platform.policy_acceptances p where p.version_id = a.id and p.user_id = (select auth.uid())),
    exists (
      select 1 from platform.policy_acceptances p
      join platform.legal_document_versions v on v.id = p.version_id
      where v.document = a.document and p.user_id = (select auth.uid())
    )
  from (
    select distinct on (v.document) v.*
    from platform.legal_document_versions v
    order by v.document, v.published_at desc, v.id
  ) a;
$$;

-- The signed-in user accepts the given versions -- only versions that are active right
-- now, only for themselves. Idempotent: accepting twice records once.
create function platform.accept_legal_document_versions(p_version_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_version_ids, '{}')) as x(id)
    where x.id not in (select s.version_id from platform.my_legal_status() s)
  ) then
    raise exception 'That version is no longer the current one. Reload and try again.';
  end if;
  insert into platform.policy_acceptances (user_id, version_id, method)
  select v_user, x.id, 'prompt' from unnest(p_version_ids) as x(id)
  on conflict (user_id, version_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Signup (apps/web/app/(auth)/actions.ts): the form says "By creating an account, you agree
-- to the Terms of Service and Privacy Policy", so a new account accepts the active versions.
-- service_role only -- the user has no session until they confirm their email.
create function platform.record_signup_legal_acceptance(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into platform.policy_acceptances (user_id, version_id, method)
  select p_user_id, a.id, 'signup'
  from (
    select distinct on (v.document) v.id
    from platform.legal_document_versions v
    order by v.document, v.published_at desc, v.id
  ) a
  on conflict (user_id, version_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function platform.publish_legal_document_version(text, text, text, text, boolean) from public, anon;
grant execute on function platform.publish_legal_document_version(text, text, text, text, boolean) to authenticated;
revoke execute on function platform.my_legal_status() from public, anon;
grant execute on function platform.my_legal_status() to authenticated;
revoke execute on function platform.accept_legal_document_versions(uuid[]) from public, anon;
grant execute on function platform.accept_legal_document_versions(uuid[]) to authenticated;
revoke execute on function platform.record_signup_legal_acceptance(uuid) from public, anon, authenticated;
grant execute on function platform.record_signup_legal_acceptance(uuid) to service_role;
revoke execute on function platform.legal_records_are_immutable() from public, anon, authenticated;
revoke execute on function platform.log_legal_document_version_audit() from public, anon, authenticated;

-- `/legal/accept` (the acceptance prompt) is a real top-level route, so `legal` joins the
-- reserved business slugs in all three places the list lives: the middleware's
-- RESERVED_TOP_SEGMENTS (same commit), this CHECK constraint and
-- core.generate_business_slug(). Same shape as 20260926150400.
update core.business_settings
set slug = slug || '-business'
where slug = 'legal'
  and not exists (select 1 from core.business_settings other where other.slug = 'legal-business');

alter table core.business_settings
  drop constraint if exists business_settings_slug_not_reserved;

alter table core.business_settings
  add constraint business_settings_slug_not_reserved check (
    slug not in (
      'dashboard', 'platform', 'login', 'signup', 'forgot-password', 'reset-password',
      'onboarding', 'auth', 'api', 'p', 'help', 'terms', 'privacy', 'pricing', 'invite', 'legal'
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
    'onboarding', 'auth', 'api', 'p', 'help', 'terms', 'privacy', 'pricing', 'invite', 'legal'
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
