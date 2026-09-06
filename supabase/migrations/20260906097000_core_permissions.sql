-- Epic 2, story C-7: core.permissions/core.role_permissions + core.has_permission() --
-- the granular per-action permission model every module's write policies can check
-- alongside core.has_module()/has_module_write() (C-3).
--
-- Seed data ported from stockpilot-ai-ops's permission_model.sql (read live): the 23
-- inventory-domain permissions (module 'inventory') and their mapping to StockPilot's
-- six operational roles (inventory_manager, procurement_manager, sales_manager,
-- accountant, warehouse_operator, viewer) plus owner/admin getting everything --
-- core.business_members.role (C-2, widened by this story) is StockPilot's own
-- organization_members.role moved here unchanged, org_id renamed to business_id.
-- FSM/CRM/GST's own permission catalogs get seeded when those modules' own stories
-- build them (F-1, S-1, S-2); the "module" column already anticipates this, matching
-- StockPilot's own forward-looking design.
--
-- Not yet done (deliberately): the actual RLS policy rewrite on inventory's own tables
-- (products, customers, sales_orders, ...) to check has_permission() instead of a
-- plain tenant check -- those tables don't exist in this platform yet (Epic 4's SP-3a).
-- SP-3b (inventory's procedural layer) is where that rewrite belongs, reusing this
-- story's catalog + has_permission() rather than rebuilding either.

create table core.permissions (
  key text primary key,
  module text not null,
  description text not null
);

create table core.role_permissions (
  role text not null,
  permission_key text not null references core.permissions (key) on delete cascade,
  primary key (role, permission_key)
);

insert into core.permissions (key, module, description) values
  ('inventory.view', 'inventory', 'View products, stock levels, categories and warehouses'),
  ('inventory.view_cost', 'inventory', 'See cost price alongside selling price'),
  ('inventory.edit', 'inventory', 'Create/update products, categories and warehouses, and post stock adjustments'),
  ('inventory.delete', 'inventory', 'Delete products, categories and warehouses'),
  ('suppliers.edit', 'inventory', 'Create/update suppliers'),
  ('suppliers.delete', 'inventory', 'Delete suppliers'),
  ('purchase_orders.edit', 'inventory', 'Create/update draft purchase orders'),
  ('purchase_orders.approve', 'inventory', 'Approve and send a purchase order to a supplier'),
  ('purchase_orders.receive', 'inventory', 'Record received quantities against a purchase order'),
  ('purchase_orders.delete', 'inventory', 'Delete purchase orders'),
  ('customers.edit', 'inventory', 'Create/update customers'),
  ('customers.delete', 'inventory', 'Delete customers'),
  ('sales_orders.edit', 'inventory', 'Create/update draft sales orders'),
  ('sales_orders.confirm', 'inventory', 'Confirm a draft sales order, reserving stock'),
  ('sales_orders.ship', 'inventory', 'Ship a confirmed sales order'),
  ('sales_orders.cancel', 'inventory', 'Cancel a sales order'),
  ('sales_orders.delete', 'inventory', 'Delete sales orders'),
  ('invoices.create', 'inventory', 'Generate a sales invoice from a sales order'),
  ('invoices.edit', 'inventory', 'Update an invoice, such as its payment status'),
  ('invoices.cancel', 'inventory', 'Issue a credit note against an invoice'),
  ('alerts.manage', 'inventory', 'Acknowledge and resolve alerts'),
  ('alerts.delete', 'inventory', 'Delete alerts'),
  ('settings.manage', 'inventory', 'Edit the business''s inventory and GST profile');

-- Owner and admin: every permission, every module.
insert into core.role_permissions (role, permission_key)
select r, p.key from core.permissions p, unnest(array['owner', 'admin']) as r;

insert into core.role_permissions (role, permission_key) values
  ('inventory_manager', 'inventory.view'),
  ('inventory_manager', 'inventory.view_cost'),
  ('inventory_manager', 'inventory.edit'),
  ('inventory_manager', 'inventory.delete'),
  ('inventory_manager', 'suppliers.edit'),
  ('inventory_manager', 'suppliers.delete'),
  ('inventory_manager', 'purchase_orders.edit'),
  ('inventory_manager', 'purchase_orders.receive'),
  ('inventory_manager', 'alerts.manage'),
  ('inventory_manager', 'alerts.delete'),

  ('procurement_manager', 'inventory.view'),
  ('procurement_manager', 'inventory.view_cost'),
  ('procurement_manager', 'suppliers.edit'),
  ('procurement_manager', 'suppliers.delete'),
  ('procurement_manager', 'purchase_orders.edit'),
  ('procurement_manager', 'purchase_orders.approve'),
  ('procurement_manager', 'purchase_orders.receive'),
  ('procurement_manager', 'purchase_orders.delete'),
  ('procurement_manager', 'alerts.manage'),

  ('sales_manager', 'inventory.view'),
  ('sales_manager', 'inventory.view_cost'),
  ('sales_manager', 'customers.edit'),
  ('sales_manager', 'customers.delete'),
  ('sales_manager', 'sales_orders.edit'),
  ('sales_manager', 'sales_orders.confirm'),
  ('sales_manager', 'sales_orders.ship'),
  ('sales_manager', 'sales_orders.cancel'),
  ('sales_manager', 'sales_orders.delete'),
  ('sales_manager', 'invoices.create'),

  ('accountant', 'inventory.view'),
  ('accountant', 'inventory.view_cost'),
  ('accountant', 'customers.edit'),
  ('accountant', 'invoices.create'),
  ('accountant', 'invoices.edit'),
  ('accountant', 'invoices.cancel'),

  ('warehouse_operator', 'inventory.view'),
  ('warehouse_operator', 'purchase_orders.receive'),
  ('warehouse_operator', 'sales_orders.ship'),
  ('warehouse_operator', 'alerts.manage'),

  ('viewer', 'inventory.view');

-- SECURITY DEFINER so it can read business_members/role_permissions regardless of the
-- caller's own row visibility -- same pattern as core.has_module() (C-3) and StockPilot's
-- own has_permission().
create function core.has_permission(p_business_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  select exists (
    select 1
    from core.business_members m
    join core.role_permissions rp on rp.role = m.role
    where m.business_id = p_business_id and m.user_id = auth.uid() and rp.permission_key = p_key
  );
$$;

revoke execute on function core.has_permission(uuid, text) from public, anon;
grant execute on function core.has_permission(uuid, text) to authenticated;

alter table core.permissions enable row level security;
alter table core.role_permissions enable row level security;

-- Catalogue and role mapping are not tenant data -- every authenticated user can read
-- them (a settings/permissions UI needs the full picture to render "what can each role
-- do"), nobody writes them from the client (service-role/migration only, matching
-- StockPilot's own "no builder yet" scope).
create policy "authenticated users can view the permission catalogue"
  on core.permissions for select
  to authenticated
  using (true);
create policy "authenticated users can view role permissions"
  on core.role_permissions for select
  to authenticated
  using (true);
