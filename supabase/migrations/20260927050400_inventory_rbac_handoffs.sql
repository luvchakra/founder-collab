-- RBAC-39 (docs/design/rbac.md) -- declared hand-off INTO Inventory, now that its tables
-- need Inventory's own permissions (20260927050000).
--
--   Service "reserve / release / consume parts for a job" (jobs.edit)
--       -> stock_movements insert/select (inventory.adjust_stock_for_contract runs as the
--          caller; the movement's effect on stock_levels, alerts and the audit log is
--          applied by security-definer triggers), stock_levels select (availability check)

create policy "service hand-off: record stock movements"
  on inventory.stock_movements for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('inventory', 'jobs.edit', true)));
create policy "service hand-off: see stock movements"
  on inventory.stock_movements for select to authenticated
  using (business_id in (select core.handoff_business_ids('inventory', 'jobs.edit', false)));
create policy "service hand-off: see stock levels"
  on inventory.stock_levels for select to authenticated
  using (business_id in (select core.handoff_business_ids('inventory', 'jobs.edit', false)));
