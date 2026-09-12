-- WonderArc Compliance backlog, COMPLY-P0-06.3 (E-Way Adapter): "Generate/update/extend/
-- cancel/status." Same shape of gap COMPLY-P0-05.3's own
-- `20260912020000_gst_einvoice_credentials_status_fetch_urls.sql` closed for
-- `gst.einvoice_credentials` -- `gst.eway_bill_credentials` only ever stored
-- `generate_url`/`cancel_url`. The real NIC e-Way Bill API genuinely exposes distinct
-- endpoints for updating Part-B vehicle details (VEHEWB), extending validity (ExtendEWB),
-- and getting current status/details (GetEwayBill) -- this is the missing half of a
-- provider config this story's own adapter interface (`lib/eway-bill-adapter/`) needs to
-- actually call, not a speculative/future-looking column.
--
-- All three new columns are NULLABLE, same reasoning as the einvoice equivalent: a
-- business already using the existing generate/cancel workflow isn't forced to re-save
-- its credentials with three new required fields it may not have to hand immediately;
-- `lib/eway-bill-adapter/gsp-adapter.ts`'s own `updateVehicle()`/`extend()`/`status()`
-- methods raise a clear "not configured" error rather than guessing at a URL when unset.
--
-- No RLS/grant change needed -- same reasoning as the einvoice migration: adding nullable
-- columns doesn't change who can write which rows, and the table's own "no SELECT grant
-- to authenticated at all" secret-lockdown is untouched.

alter table gst.eway_bill_credentials
  add column vehicle_update_url text,
  add column extend_url text,
  add column status_url text;

-- `eway_bill_credentials_status()` is the only read surface `authenticated` has onto this
-- table (never the secret columns) -- extend its return shape the same way
-- `einvoice_credentials_status()` was extended, so the existing settings page can show
-- what's configured. Postgres won't let `create or replace function` change a
-- `returns table(...)` column list in place, so drop first (only
-- `getEwayBillCredentialsStatus` calls it, via `supabase.rpc()`, which resolves by name at
-- call time, not a schema-bound reference).
drop function if exists gst.eway_bill_credentials_status(uuid);

create function gst.eway_bill_credentials_status(_business uuid)
returns table(
  gsp_provider text, auth_url text, generate_url text, cancel_url text,
  vehicle_update_url text, extend_url text, status_url text, updated_at timestamptz
)
language sql stable security definer set search_path = gst, core as $$
  select c.gsp_provider, c.auth_url, c.generate_url, c.cancel_url,
         c.vehicle_update_url, c.extend_url, c.status_url, c.updated_at
  from gst.eway_bill_credentials c
  where c.business_id = _business
    and _business in (select core.user_business_ids())
    and _business in (select core.licensed_business_ids('gst'));
$$;
revoke all on function gst.eway_bill_credentials_status(uuid) from public;
grant execute on function gst.eway_bill_credentials_status(uuid) to authenticated;
