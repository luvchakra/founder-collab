-- Minimal stand-in for the pieces of a real Supabase project that migrations assume
-- exist (the `anon`/`authenticated`/`service_role` roles, `auth.users` + `auth.uid()`,
-- `storage.buckets`/`storage.objects` + `storage.foldername()`) but that a vanilla
-- Postgres instance doesn't provide. Used only to verify migrations against a local
-- Postgres when the real target project isn't reachable (see docs/PORT-PROVENANCE.md's
-- network note) -- never run this against a real Supabase project, which already has
-- the genuine versions of all of this.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;
-- A real Supabase project grants USAGE on `auth` broadly (anon/authenticated/service_role
-- all call auth.uid()/auth.role() directly). Without this, a table column DEFAULT of
-- auth.uid() still works under a test role (that expression is parsed once, at DDL time,
-- by the migration-applying superuser, and stored pre-resolved in pg_attrdef -- no fresh
-- name lookup happens at INSERT time), but any FRESH SQL text containing `auth.uid()` --
-- typed directly, or inside a plpgsql function body that isn't SECURITY DEFINER, which
-- parses under the calling role -- fails with "permission denied for schema auth" purely
-- because of this stub's own gap, not because of anything wrong in the migration under
-- test. inventory.ship_stock_transfer() (SP-3b) is the first thing in this migration
-- timeline to hit that path, which is what surfaced this.
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid
language sql stable
as $func$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$func$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $func$
  select string_to_array(name, '/')
$func$;
