-- SP-9: the one new database primitive module-inventory's contract/index.ts needs that
-- didn't already exist as a per-workflow RPC (confirm_sales_order/ship_stock_transfer/
-- receive_purchase_order_item each validate-then-insert their own specific movement type
-- atomically -- there was no generic equivalent for an arbitrary caller, e.g. a future
-- module reserving/releasing/consuming stock directly, to reuse).
--
-- Deliberately NOT security definer -- runs as the calling user through the normal
-- RLS-scoped client, same as every other write in this schema (00-MASTER-PLAN.md §6
-- mechanism 2: "call another module's contract/index.ts function synchronously"). A
-- caller whose business lacks the inventory license hits the same tenant+licensed RLS
-- policy on inventory.stock_movements any direct write would -- contract/index.ts's own
-- has_module() pre-check turns that into a clean `MODULE_NOT_LICENSED` result rather
-- than a raw Postgres RLS error before this RPC is even called, but the RLS itself is
-- still the authoritative backstop.
create function inventory.adjust_stock_for_contract(
  _business_id uuid,
  _item_id uuid,
  _warehouse_id uuid,
  _movement_type inventory.movement_type,
  _quantity numeric,
  _reference text default null
)
returns uuid
language plpgsql
set search_path = inventory, core
as $$
declare
  _movement_id uuid;
  _level record;
  _available numeric;
begin
  if _movement_type not in ('reserve', 'unreserve', 'outbound') then
    raise exception 'adjust_stock_for_contract only supports reserve/unreserve/outbound, got %', _movement_type;
  end if;
  if _quantity is null or _quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select quantity, reserved, damaged, expired into _level
  from inventory.stock_levels where item_id = _item_id and warehouse_id = _warehouse_id;

  _available := coalesce(_level.quantity, 0) - coalesce(_level.reserved, 0)
    - coalesce(_level.damaged, 0) - coalesce(_level.expired, 0);

  if _movement_type = 'reserve' and _available < _quantity then
    raise exception 'Not enough available stock to reserve: need %, have %', _quantity, _available;
  elsif _movement_type = 'outbound' and _available < _quantity then
    raise exception 'Not enough available stock to consume: need %, have %', _quantity, _available;
  elsif _movement_type = 'unreserve' and coalesce(_level.reserved, 0) < _quantity then
    raise exception 'Cannot release more than is reserved: releasing %, only % reserved', _quantity, coalesce(_level.reserved, 0);
  end if;

  insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity, reference, notes, created_by)
  values (_business_id, _item_id, _warehouse_id, _movement_type, _quantity, _reference, 'Adjusted via module contract', auth.uid())
  returning id into _movement_id;

  return _movement_id;
end;
$$;

revoke execute on function inventory.adjust_stock_for_contract(uuid, uuid, uuid, inventory.movement_type, numeric, text) from public, anon;
grant execute on function inventory.adjust_stock_for_contract(uuid, uuid, uuid, inventory.movement_type, numeric, text) to authenticated;
