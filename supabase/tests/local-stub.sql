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
