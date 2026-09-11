-- PLATFORM-P0-03.1: "WonderArc Branding" (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §7).
-- A single, platform-wide branding record -- not a customer/business table, never gated
-- by core.licenses (CLAUDE.md non-negotiable #1's `platform` schema exception).
--
-- Every field the story literally lists maps to a real column here:
--   Platform Name    -> platform_name
--   Logo              -> logo_url
--   Favicon           -> favicon_url
--   Primary Brand     -> primary_color
--   Secondary Brand   -> secondary_color
--   Accent Color      -> accent_color
--   Login Branding    -> login_headline, login_support_text
--   Email Branding    -> email_from_name
--   Footer            -> footer_text
--   Support Contact   -> support_email, support_url
--
-- Deliberately NOT built here (later, separate stories in the same §7 section, so left
-- for their own turn rather than guessed at ahead of time):
--   - draft/preview/publish workflow (PLATFORM-P0-03.5)
--   - the fuller login-page treatment -- background/legal links (PLATFORM-P0-03.3)
--   - non-color design tokens: radius, button style, font, spacing density
--     (PLATFORM-P0-03.2)
--   - configuration version history (PLATFORM-P0-17)
--   - an immutable audit trail entry per change (PLATFORM-P0-16) -- core.audit_log is
--     hard-required to a business_id (see core.write_audit_log's signature), so it
--     structurally cannot record a platform-wide change; updated_by/updated_at below is
--     the same "minimal accountability, not full history" scope core.permissions/
--     core.role_permissions already accept while awaiting their own future builder.
--
-- Singleton by construction: primary key is a boolean fixed to `true` (the standard
-- Postgres "exactly one row" trick) rather than a uuid -- there is exactly one WonderArc
-- brand, never a list of them. A uuid primary key plus a `check (id) constraint` alone
-- would still allow it, but a boolean PK makes "there can only ever be one row" obvious
-- from the column's type itself, not just a constraint someone could drop later. Seeded
-- once here; RLS below allows UPDATE only, never INSERT/DELETE, so the row count can
-- never drift from 1 through the app.
create table platform.branding (
  id boolean primary key default true check (id),

  platform_name text not null default 'WonderArc' check (btrim(platform_name) <> ''),
  logo_url text check (logo_url is null or logo_url ~ '^https?://'),
  favicon_url text check (favicon_url is null or favicon_url ~ '^https?://'),

  primary_color text not null default '#2563eb' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text check (secondary_color is null or secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),

  login_headline text,
  login_support_text text,

  email_from_name text,

  footer_text text,

  support_email text check (support_email is null or support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  support_url text check (support_url is null or support_url ~ '^https?://'),

  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index branding_updated_by_idx on platform.branding (updated_by);

insert into platform.branding (id) values (true);

alter table platform.branding enable row level security;

-- Same authorization boundary as platform.admins: platform.is_superadmin(), a SECURITY
-- DEFINER function, is the actual RLS-backed check -- not an application-code-only gate.
-- Unlike platform.admins (which has no write policy yet, by design), this table's whole
-- purpose this story is superadmin read/write, so both policies exist now.
create policy "superadmins can view platform branding" on platform.branding for select to authenticated
  using (platform.is_superadmin());

create policy "superadmins can update platform branding" on platform.branding for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

grant select, update on platform.branding to authenticated;
grant all on platform.branding to service_role;
