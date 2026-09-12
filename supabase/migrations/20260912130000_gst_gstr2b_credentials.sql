-- WonderArc Compliance backlog, COMPLY-P0-08.1 (GSTR-2B Fetch/Import), starting Epic 08
-- (India Reconciliation & IMS). Checked `docs/plan/00-MASTER-PLAN.md` §5 and this
-- backlog's own §5 "Data ownership" first (backlog rule 1/5): no existing table anywhere
-- in the platform models a GSTN "returns" API credential -- `gst.eway_bill_credentials`/
-- `gst.einvoice_credentials` are their own distinct GSP endpoints (e-way bill generation,
-- e-invoice/IRP), not the "Returns" API a GSP exposes for fetching a taxpayer's own
-- auto-drafted statements (GSTR-2A/2B). This is that credential table -- same shape as
-- the other two (this platform's own established pattern for "a business's own configured
-- GSP" secrets), not a variant invented from scratch.
--
-- SECRET STORAGE from the start, not a follow-up fix: `gst.eway_bill_credentials`/
-- `einvoice_credentials` originally stored `gsp_password`/`client_secret` as plaintext and
-- needed `20260909010000_gst_credentials_encrypt_secrets.sql` to rename+encrypt them after
-- the fact (docs/testing/EXECUTION-2026-09-08.md finding 3). This table is created with
-- `encrypted_gsp_password`/`encrypted_client_secret` (AES-256-GCM ciphertext via
-- `@cofounderai/core/crypto/api-key`, same as BYOK's `encrypted_api_key`) from its very
-- first migration, applying that lesson rather than repeating the mistake -- same
-- discipline COMPLY-P0-07.6/07.7 already applied to their own new function
-- (`set search_path` from creation, not a follow-up).
--
-- Same "no SELECT grant/policy for `authenticated` at all" secret lockdown as the other
-- two credential tables -- a GSP password/client secret must never reach the browser.
-- Non-secret status is exposed via `gstr2b_credentials_status()`, a SECURITY DEFINER
-- function that never selects the secret columns, mirroring
-- `eway_bill_credentials_status()`/`einvoice_credentials_status()` exactly.
--
-- Real-world note (documented for whoever builds the fetch UI in a later story): unlike
-- e-invoice/e-way-bill generation (a straightforward POST a GSP fronts), most GSPs' own
-- GSTR-2B "Returns" API additionally requires a short-lived OTP-verified session token on
-- top of client-id/client-secret (the GST Portal itself only ever serves 2B to an
-- interactively-logged-in session) -- this table still only stores the same
-- provider/URL/client-credential shape as the other two tables (the deliberate
-- simplification this whole module already makes for GSP integrations, same as
-- `EwayBillGenerateRequest` only sending docNo/docDate/totalValue rather than a fully
-- NIC-compliant payload) rather than inventing an OTP-session-token concept no other
-- credential table here models. `lib/gstr2b/`'s own import path this story ships (manual
-- JSON upload, sourced from what a business already downloaded from the GST portal or its
-- own GSP dashboard) does not depend on this table at all -- this table only backs the
-- OPTIONAL adapter-based fetch path for a business whose configured GSP does expose a
-- non-interactive Returns API.

create table gst.gstr2b_credentials (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  gsp_provider text not null,
  fetch_url text not null,
  gsp_username text,
  encrypted_gsp_password text,
  client_id text,
  encrypted_client_secret text,
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table gst.gstr2b_credentials is
  'COMPLY-P0-08.1: optional GSP credentials for fetching a business''s own GSTR-2B '
  'statement via its configured provider''s Returns API. Manual JSON upload '
  '(lib/gstr2b/mutations.ts importGstr2bStatement) never needs this table.';

create trigger gstr2b_credentials_set_updated_at
  before update on gst.gstr2b_credentials
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security -- write-only for `authenticated` (tenant AND licensed AND
-- settings.manage), no SELECT policy at all. Identical shape to
-- `20260907150000_gst_credentials_schema.sql`'s own policies for the other two
-- credential tables.
-- ---------------------------------------------------------------------------

alter table gst.gstr2b_credentials enable row level security;

create policy "settings managers can create gstr2b_credentials in their licensed businesses"
  on gst.gstr2b_credentials for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

create policy "settings managers can update gstr2b_credentials in their licensed businesses"
  on gst.gstr2b_credentials for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

create policy "settings managers can delete gstr2b_credentials in their licensed businesses"
  on gst.gstr2b_credentials for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

-- No select policy at all -- see this file's own top-of-file docstring.

grant insert, update, delete on gst.gstr2b_credentials to authenticated;
grant all on gst.gstr2b_credentials to service_role;

create function gst.gstr2b_credentials_status(_business uuid)
returns table(gsp_provider text, fetch_url text, updated_at timestamptz)
language sql stable security definer set search_path = gst, core as $$
  select c.gsp_provider, c.fetch_url, c.updated_at
  from gst.gstr2b_credentials c
  where c.business_id = _business
    and _business in (select core.user_business_ids())
    and _business in (select core.licensed_business_ids('gst'));
$$;
revoke all on function gst.gstr2b_credentials_status(uuid) from public;
grant execute on function gst.gstr2b_credentials_status(uuid) to authenticated;
