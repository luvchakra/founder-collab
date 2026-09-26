-- RBAC-39 (docs/design/rbac.md) -- Discovery joins every other module in `tenant AND
-- licensed AND permitted`. Until now its offering-centric tables were tenant-only: any
-- member of the business (a viewer included) could read and write them through the API,
-- with no licence check. Marketing and Funding's tables already used the licensed
-- helpers and are left as they are.
--
--   read   = Discovery licensed (active, or grace) AND (discovery.view or any Discovery
--            permission)                        -> discovery.readable_*()
--   write  = Discovery licence active AND discovery.manage  -> discovery.writable_*()
--
-- Every existing policy keeps its shape: only the tenancy function it calls is swapped
-- (SELECT policies to the readable_ set, INSERT/UPDATE/DELETE to the writable_ set), so no
-- policy is rewritten by hand. The membership functions discovery.user_workspace_ids() /
-- user_product_ids() stay as they are for any other caller.
--
-- Declared hand-offs into Discovery (the only cross-module writes allowed here):
--   CRM "convert ticket to prospect"      (leads.manage)   -> prospects insert/select
--   Inventory "mirror item to offering"   (inventory.edit) -> products insert/select/update

-- ---------------------------------------------------------------------------------------
-- Tenancy helpers
-- ---------------------------------------------------------------------------------------

create or replace function discovery.readable_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select core.licensed_business_ids('discovery');
$$;

create or replace function discovery.writable_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select l.business_id from core.licenses l
  where l.module_key = 'discovery'
    and l.status = 'active'
    and l.business_id in (select core.user_business_ids())
    and core.has_business_permission(l.business_id, 'discovery.manage');
$$;

create or replace function discovery.readable_product_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery, core
as $$
  select p.id from discovery.products p where p.business_id in (select discovery.readable_business_ids());
$$;

create or replace function discovery.writable_product_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery, core
as $$
  select p.id from discovery.products p where p.business_id in (select discovery.writable_business_ids());
$$;

create or replace function discovery.readable_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery, core
as $$
  select w.id from discovery.workspaces w where w.product_id in (select discovery.readable_product_ids());
$$;

create or replace function discovery.writable_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery, core
as $$
  select w.id from discovery.workspaces w where w.product_id in (select discovery.writable_product_ids());
$$;

-- Workspaces of businesses where the caller holds a hand-off permission.
create or replace function discovery.handoff_workspace_ids(p_permission text, p_write boolean)
returns setof uuid
language sql
stable
security definer
set search_path = discovery, core
as $$
  select w.id from discovery.workspaces w
  join discovery.products p on p.id = w.product_id
  where p.business_id in (select core.handoff_business_ids('discovery', p_permission, p_write));
$$;

revoke execute on function discovery.readable_business_ids() from public, anon;
revoke execute on function discovery.writable_business_ids() from public, anon;
revoke execute on function discovery.readable_product_ids() from public, anon;
revoke execute on function discovery.writable_product_ids() from public, anon;
revoke execute on function discovery.readable_workspace_ids() from public, anon;
revoke execute on function discovery.writable_workspace_ids() from public, anon;
revoke execute on function discovery.handoff_workspace_ids(text, boolean) from public, anon;
grant execute on function discovery.readable_business_ids() to authenticated, service_role;
grant execute on function discovery.writable_business_ids() to authenticated, service_role;
grant execute on function discovery.readable_product_ids() to authenticated, service_role;
grant execute on function discovery.writable_product_ids() to authenticated, service_role;
grant execute on function discovery.readable_workspace_ids() to authenticated, service_role;
grant execute on function discovery.writable_workspace_ids() to authenticated, service_role;
grant execute on function discovery.handoff_workspace_ids(text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- Swap the tenancy function in every tenant-only Discovery policy
-- ---------------------------------------------------------------------------------------

do $$
declare
  pol record;
  is_read boolean;
  new_qual text;
  new_check text;
  stmt text;
begin
  for pol in
    select policyname, tablename, cmd, qual, with_check
    from pg_policies
    where schemaname = 'discovery'
      -- Marketing/Funding policies already call the licensed helpers; account-scoped
      -- credentials are not business data.
      and coalesce(qual, '') || coalesce(with_check, '') not like '%licensed_business_ids%'
      and coalesce(qual, '') || coalesce(with_check, '') similar to '%(user_workspace_ids|user_product_ids|user_business_ids)%'
  loop
    is_read := pol.cmd = 'SELECT';
    new_qual := pol.qual;
    new_check := pol.with_check;
    if new_qual is not null then
      new_qual := replace(new_qual, 'discovery.user_workspace_ids()',
        case when is_read then 'discovery.readable_workspace_ids()' else 'discovery.writable_workspace_ids()' end);
      new_qual := replace(new_qual, 'discovery.user_product_ids()',
        case when is_read then 'discovery.readable_product_ids()' else 'discovery.writable_product_ids()' end);
      new_qual := replace(new_qual, 'core.user_business_ids()',
        case when is_read then 'discovery.readable_business_ids()' else 'discovery.writable_business_ids()' end);
    end if;
    if new_check is not null then
      new_check := replace(new_check, 'discovery.user_workspace_ids()', 'discovery.writable_workspace_ids()');
      new_check := replace(new_check, 'discovery.user_product_ids()', 'discovery.writable_product_ids()');
      new_check := replace(new_check, 'core.user_business_ids()', 'discovery.writable_business_ids()');
    end if;

    stmt := format('alter policy %I on discovery.%I', pol.policyname, pol.tablename);
    if new_qual is not null then stmt := stmt || format(' using (%s)', new_qual); end if;
    if new_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;
    execute stmt;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Declared hand-offs into Discovery
-- ---------------------------------------------------------------------------------------

-- CRM: a support ticket becomes a Discovery prospect (createProspectFromExternalLead).
create policy "crm hand-off: create prospects"
  on discovery.prospects for insert to authenticated
  with check (workspace_id in (select discovery.handoff_workspace_ids('leads.manage', true)));
create policy "crm hand-off: see prospects"
  on discovery.prospects for select to authenticated
  using (workspace_id in (select discovery.handoff_workspace_ids('leads.manage', false)));
create policy "crm hand-off: see offerings"
  on discovery.products for select to authenticated
  using (business_id in (select core.handoff_business_ids('discovery', 'leads.manage', false)));
create policy "crm hand-off: see workspaces"
  on discovery.workspaces for select to authenticated
  using (id in (select discovery.handoff_workspace_ids('leads.manage', false)));

-- Inventory: a new stock item is mirrored as a Discovery offering
-- (createProductFromInventoryItem); the default workspace comes from a security-definer
-- trigger.
create policy "inventory hand-off: create offerings"
  on discovery.products for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('discovery', 'inventory.edit', true)));
create policy "inventory hand-off: update offerings"
  on discovery.products for update to authenticated
  using (business_id in (select core.handoff_business_ids('discovery', 'inventory.edit', true)));
create policy "inventory hand-off: see offerings"
  on discovery.products for select to authenticated
  using (business_id in (select core.handoff_business_ids('discovery', 'inventory.edit', false)));
