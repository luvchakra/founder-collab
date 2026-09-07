-- Epic 4/SP-7 (GST slice): `gst` schema -- its first tables, per
-- docs/plan/00-MASTER-PLAN.md §5's entity-ownership map ("gst module: e-invoice,
-- e-way bill, credentials, return workspaces (seeded from StockPilot's existing
-- tables)"). Ported from stockpilot-ai-ops's `public.eway_bill_credentials` /
-- `public.einvoice_credentials` (supabase/migrations/20260908000000_eway_bills.sql,
-- 20260909000000_einvoicing.sql) -- column-identical except `org_id` -> `business_id`
-- (ADR-4, same rename SP-3a applied to inventory's own new tables) and the schema itself
-- (`gst`, not `public` -- this platform's own non-negotiable #1: every module-owned
-- table lives in its own schema).
--
-- SECRET STORAGE, kept verbatim from upstream (already reviewed there as SP-7/SP-8's own
-- "same class of risk as the reveal-service-role-key finding" note): no SELECT grant or
-- policy for `authenticated` at all on either credentials table. A GSP (GST Suvidha
-- Provider -- ClearTax, MasterGST, Vayana, Whitebooks, etc.) password/client_secret must
-- never reach the browser -- only `service_role` (the future e-way-bill/e-invoice
-- generate/cancel server actions, not built in this slice) can read these columns.
-- Non-secret status (which GSP, which URLs, last updated) is exposed separately via
-- `eway_bill_credentials_status()`/`einvoice_credentials_status()`, SECURITY DEFINER
-- functions that never select the secret columns -- same split upstream had, extended
-- here with this platform's own tenant+license check (upstream had no licensing
-- concept at all).
--
-- Only the credential-storage half of upstream's two migrations is ported this slice
-- (the account-settings forms this story asked to move) -- the generation-history
-- tables (`eway_bills`, `einvoices`, their `eway_bills.generate`/`cancel` etc.
-- permissions) back the actual "generate a bill/IRN from a sales order/invoice" workflow
-- elsewhere in StockPilot's UI, out of scope here; a later GST slice ports those
-- alongside the generate/cancel server actions that would actually use them.

create schema if not exists gst;

create table gst.eway_bill_credentials (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  gsp_provider text not null,
  auth_url text not null,
  generate_url text not null,
  cancel_url text not null,
  gsp_username text,
  gsp_password text,
  client_id text,
  client_secret text,
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table gst.einvoice_credentials (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  gsp_provider text not null,
  auth_url text not null,
  generate_url text not null,
  cancel_url text not null,
  gsp_username text,
  gsp_password text,
  client_id text,
  client_secret text,
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger eway_bill_credentials_set_updated_at
  before update on gst.eway_bill_credentials
  for each row execute function core.set_updated_at();

create trigger einvoice_credentials_set_updated_at
  before update on gst.einvoice_credentials
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security -- write-only for `authenticated` (tenant AND licensed AND
-- settings.manage), no SELECT policy at all (upstream's own secret-lockdown pattern).
-- ---------------------------------------------------------------------------

alter table gst.eway_bill_credentials enable row level security;
alter table gst.einvoice_credentials enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['eway_bill_credentials', 'einvoice_credentials']
  loop
    execute format(
      $sql$create policy "settings managers can create %1$s in their licensed businesses"
        on gst.%1$I for insert
        with check (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('gst'))
          and core.has_permission(business_id, 'settings.manage')
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "settings managers can update %1$s in their licensed businesses"
        on gst.%1$I for update
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('gst'))
          and core.has_permission(business_id, 'settings.manage')
        )
        with check (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('gst'))
          and core.has_permission(business_id, 'settings.manage')
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "settings managers can delete %1$s in their licensed businesses"
        on gst.%1$I for delete
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('gst'))
          and core.has_permission(business_id, 'settings.manage')
        )$sql$,
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Non-secret status functions -- SECURITY DEFINER, never select gsp_username/
-- gsp_password/client_id/client_secret. Gated by tenant + license (read variant --
-- active OR grace, matching every other module read) since upstream's own
-- `is_org_member()` equivalent (`core.user_business_ids()`) has no licensing concept to
-- fold in on its own.
-- ---------------------------------------------------------------------------

create function gst.eway_bill_credentials_status(_business uuid)
returns table(gsp_provider text, auth_url text, generate_url text, cancel_url text, updated_at timestamptz)
language sql stable security definer set search_path = gst, core as $$
  select c.gsp_provider, c.auth_url, c.generate_url, c.cancel_url, c.updated_at
  from gst.eway_bill_credentials c
  where c.business_id = _business
    and _business in (select core.user_business_ids())
    and _business in (select core.licensed_business_ids('gst'));
$$;
revoke all on function gst.eway_bill_credentials_status(uuid) from public;
grant execute on function gst.eway_bill_credentials_status(uuid) to authenticated;

create function gst.einvoice_credentials_status(_business uuid)
returns table(gsp_provider text, auth_url text, generate_url text, cancel_url text, updated_at timestamptz)
language sql stable security definer set search_path = gst, core as $$
  select c.gsp_provider, c.auth_url, c.generate_url, c.cancel_url, c.updated_at
  from gst.einvoice_credentials c
  where c.business_id = _business
    and _business in (select core.user_business_ids())
    and _business in (select core.licensed_business_ids('gst'));
$$;
revoke all on function gst.einvoice_credentials_status(uuid) from public;
grant execute on function gst.einvoice_credentials_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Schema/table grants -- see 20260907120000_grant_schema_privileges.sql's own docstring
-- for why these are needed at all (Postgres checks role grants before RLS ever runs).
-- No SELECT grant to `authenticated` on either table, deliberately -- that's the whole
-- point of this schema. No `alter default privileges` blanket grant either: a future
-- non-secret gst table should get its own explicit, ordinary select/insert/update/
-- delete grant in its own migration, not inherit whatever default this one sets.
-- ---------------------------------------------------------------------------

grant usage on schema gst to authenticated, service_role;

grant insert, update, delete on gst.eway_bill_credentials, gst.einvoice_credentials to authenticated;
grant all on gst.eway_bill_credentials, gst.einvoice_credentials to service_role;

-- PostgREST only routes requests to schemas listed in the `authenticator` role's
-- pgrst.db_schemas setting (the Data API "Exposed schemas" list) -- confirmed via
-- `select rolconfig from pg_roles where rolname = 'authenticator'` that this was set to
-- 'public, graphql_public, core, discovery, inventory' for the earlier schemas (out of
-- band, not captured in any prior migration -- a pre-existing gap in this timeline, not
-- introduced here). Appending `gst` here so a fresh environment applying this whole
-- timeline actually gets it exposed too, not just a manual fix on this one project.
--
-- Guarded by a role-existence check: the real Supabase project has `authenticator`, but
-- the local/CI test harness (supabase/tests/local-stub.sql) only stubs anon/authenticated/
-- service_role -- this whole block is a no-op there instead of failing every RLS test's
-- migration-apply step on a role that doesn't exist locally.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_schemas = ''public, graphql_public, core, discovery, inventory, gst''';
  end if;
end $$;
notify pgrst, 'reload config';
