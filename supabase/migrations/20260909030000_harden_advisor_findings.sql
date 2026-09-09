-- Addresses two real, fixable Supabase advisor findings (2026-09-09 sweep) -- the
-- rls_enabled_no_policy findings on core.api_rate_limit_counters/demo_seed_batches/
-- demo_seed_records/number_sequences and discovery.interest_signups are deliberately
-- left alone: each one's own creating migration already documents, in its own comment,
-- that zero client-facing policies is the intended design (a SECURITY DEFINER function
-- or a service-role-only admin path is the sole write/read path) -- not a gap to fix.
--
-- 1. function_search_path_mutable (47 findings): every `..._instead_of_*` compat-view
--    trigger function in `inventory` (SP-4, plus the two this platform's own
--    20260908150000 tax-fields fix replaced) and its four `next_*_number()` helpers
--    were created without a `search_path`, unlike almost every other SECURITY DEFINER/
--    plpgsql function in this codebase (which routinely sets one, e.g. gst/fsm's own
--    `set search_path = gst, core`). Confirmed before writing this that every one of
--    these 47 already fully-qualifies every table/function reference in its own body
--    (`core.parties`, `core.next_number(...)`, etc.) -- spot-checked several, no
--    unqualified reference found -- so this is a pure hardening change (closes the
--    search-path-hijacking vector the advisor warns about) with zero behavioral
--    difference, not a functional fix. `alter function ... set search_path` rather
--    than `create or replace function` -- doesn't touch a single function body.
--
-- 2. anon/authenticated_security_definer_function_executable on
--    `public.rls_auto_enable()`: a Supabase-project-default event-trigger function
--    (not created by any migration in this repo -- confirmed via
--    `pg_get_functiondef()` before touching it), meant to fire automatically on
--    `CREATE TABLE` in `public`, never to be called directly. Revoking direct EXECUTE
--    from `anon`/`authenticated` closes the PostgREST RPC path
--    (`/rest/v1/rpc/rls_auto_enable`) without touching the event-trigger registration
--    itself, which doesn't go through role-based EXECUTE grants at all.
--    (Turned out incomplete -- see the very next migration's own comment.)

alter function inventory.sales_invoice_items_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.purchase_orders_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.purchase_orders_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.purchase_orders_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.purchase_order_items_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.purchase_order_items_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.purchase_order_items_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.credit_notes_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.credit_notes_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.credit_notes_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.products_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.sales_orders_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.sales_orders_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.sales_order_items_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.sales_order_items_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.sales_order_items_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.sales_invoices_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.sales_invoices_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.sales_invoices_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.products_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.products_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.organizations_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.customers_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.customers_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.customers_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.suppliers_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.suppliers_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.suppliers_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.sales_invoice_items_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.sales_invoice_items_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.debit_notes_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.debit_notes_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.debit_notes_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.proforma_invoices_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.proforma_invoices_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.proforma_invoices_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.sales_returns_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.sales_returns_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.sales_return_items_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.sales_return_items_instead_of_update() set search_path = inventory, core, pg_temp;
alter function inventory.sales_return_items_instead_of_delete() set search_path = inventory, core, pg_temp;
alter function inventory.sales_returns_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.sales_orders_instead_of_insert() set search_path = inventory, core, pg_temp;
alter function inventory.next_sales_order_number(uuid) set search_path = inventory, core, pg_temp;
alter function inventory.next_sales_invoice_number(uuid) set search_path = inventory, core, pg_temp;
alter function inventory.next_credit_note_number(uuid) set search_path = inventory, core, pg_temp;
alter function inventory.next_sales_return_number(uuid) set search_path = inventory, core, pg_temp;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from anon, authenticated;
  end if;
end $$;
