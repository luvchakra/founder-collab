-- DISC-OFFER-P1-01.3 "Account Watchlist" -- the table (20260913710000) was created with
-- tenant-only policies (`discovery.user_workspace_ids()`), the shape the ported discovery
-- tables were written in. CLAUDE.md non-negotiable 2 requires `tenant AND licensed` on
-- every module table, so the watchlist's policies are rewritten here: reads need an
-- active-or-grace Discovery licence, writes an active one and a role that can write
-- (ADR-9: grace is read-only; cancelling never deletes the rows).
--
-- Workspace-scoped tables carry no business_id, so two helpers resolve the licensed
-- workspaces once, the same way `discovery.user_workspace_ids()` resolves tenancy. They
-- call `core.licensed_business_ids()` / `core.write_licensed_business_ids()`, which
-- already include the caller's own business membership, so each helper is on its own
-- "tenant AND licensed". Other workspace-scoped discovery tables can adopt them as their
-- own stories touch them; this migration changes only the watchlist.
create function discovery.licensed_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery, core
as $$
  select w.id
  from discovery.workspaces w
  join discovery.products p on p.id = w.product_id
  where p.business_id in (select core.licensed_business_ids('discovery'));
$$;

create function discovery.write_licensed_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = discovery, core
as $$
  select w.id
  from discovery.workspaces w
  join discovery.products p on p.id = w.product_id
  where p.business_id in (select core.write_licensed_business_ids('discovery'));
$$;

revoke execute on function discovery.licensed_workspace_ids() from public, anon;
revoke execute on function discovery.write_licensed_workspace_ids() from public, anon;
grant execute on function discovery.licensed_workspace_ids() to authenticated;
grant execute on function discovery.write_licensed_workspace_ids() to authenticated;

drop policy "members can view watchlist entries in their workspaces" on discovery.watchlist_entries;
drop policy "members can create watchlist entries in their workspaces" on discovery.watchlist_entries;
drop policy "members can update watchlist entries in their workspaces" on discovery.watchlist_entries;
drop policy "members can delete watchlist entries in their workspaces" on discovery.watchlist_entries;

create policy "members can view watchlist entries in licensed workspaces"
  on discovery.watchlist_entries for select
  using (workspace_id in (select discovery.licensed_workspace_ids()));
create policy "members can create watchlist entries in licensed workspaces"
  on discovery.watchlist_entries for insert
  with check (workspace_id in (select discovery.write_licensed_workspace_ids()));
create policy "members can update watchlist entries in licensed workspaces"
  on discovery.watchlist_entries for update
  using (workspace_id in (select discovery.write_licensed_workspace_ids()))
  with check (workspace_id in (select discovery.write_licensed_workspace_ids()));
create policy "members can delete watchlist entries in licensed workspaces"
  on discovery.watchlist_entries for delete
  using (workspace_id in (select discovery.write_licensed_workspace_ids()));
