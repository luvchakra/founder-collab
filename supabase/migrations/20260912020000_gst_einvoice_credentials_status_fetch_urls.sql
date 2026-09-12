-- WonderArc Compliance backlog, COMPLY-P0-05.3 (IRP Adapter): "Provider interface: submit,
-- status, cancel, fetch." `gst.einvoice_credentials` (20260907150000_gst_credentials_schema.sql)
-- only ever stored `generate_url`/`cancel_url` -- the earlier S-2 slice that created it only
-- built a generate/cancel workflow, with no status/fetch operation to point a URL at. The
-- real NIC/GSP e-invoice (IRP) API genuinely exposes distinct endpoints for these
-- ("Get IRN details by IRN", "Get IRN details by Doc Details") -- this is not a
-- speculative/future-looking column, it is the missing half of a provider config this
-- story's own adapter interface (`lib/irp-adapter/`) needs to actually call.
--
-- Both new columns are NULLABLE, unlike `generate_url`/`cancel_url` (`not null`) -- a
-- business already using this platform's existing generate/cancel workflow should not be
-- forced to re-save its credentials with two new required fields it may not have to hand
-- immediately; `lib/irp-adapter/gsp-adapter.ts`'s own `status()`/`fetch()` methods raise a
-- clear "not configured" error rather than guessing at a URL when either is unset, same
-- "unknown, don't assume" posture this module has used since COMPLY-P0-03.4.
--
-- No RLS/grant change needed -- `gst.einvoice_credentials`'s existing INSERT/UPDATE
-- policies (COMPLY-P0-... predates this backlog, from Epic 4/SP-7) are row-level, not
-- column-level; adding two nullable columns doesn't change who can write which rows, and
-- the table's own "no SELECT grant to authenticated at all" secret-lockdown is untouched.

alter table gst.einvoice_credentials
  add column status_url text,
  add column fetch_url text;

-- `einvoice_credentials_status()` (20260907150000) is the only read surface `authenticated`
-- has onto this table (never the secret columns) -- extend its return shape to include the
-- two new non-secret URL columns so the existing settings page can show what's configured,
-- same security-definer/tenant+license gate as before, unchanged. Postgres won't let
-- `create or replace function` change a `returns table(...)` column list in place, so drop
-- first (the function has no other dependents -- only `getEinvoiceCredentialsStatus`
-- calls it, via `supabase.rpc()`, which resolves by name at call time, not a schema-bound
-- reference).
drop function if exists gst.einvoice_credentials_status(uuid);

create function gst.einvoice_credentials_status(_business uuid)
returns table(
  gsp_provider text, auth_url text, generate_url text, cancel_url text,
  status_url text, fetch_url text, updated_at timestamptz
)
language sql stable security definer set search_path = gst, core as $$
  select c.gsp_provider, c.auth_url, c.generate_url, c.cancel_url, c.status_url, c.fetch_url, c.updated_at
  from gst.einvoice_credentials c
  where c.business_id = _business
    and _business in (select core.user_business_ids())
    and _business in (select core.licensed_business_ids('gst'));
$$;
revoke all on function gst.einvoice_credentials_status(uuid) from public;
grant execute on function gst.einvoice_credentials_status(uuid) to authenticated;
