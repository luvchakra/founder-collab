-- Wires inventory.stock_movements' human-initiated correction movement types into the
-- existing core.audit_log write helper (D-10) -- the "as those tables get built" future
-- caller D-10's own docstring pointed to (inventory's tables were built in SP-3a/SP-3b,
-- after D-10 landed). Only 'adjustment'/'damage'/'expired' log an entry, deliberately
-- excluding the system-driven movement types (reserve/inbound-from-receiving/outbound-
-- from-shipping/transfers) -- those already have their own paper trail through the
-- purchase/sales order or transfer they belong to (core.documents' own
-- document.status_changed trigger). Matches stockpilot-ai-ops's own
-- log_stock_adjustment() scoping exactly (read live, 20260907000000_audit_log.sql).
create function inventory.log_stock_adjustment()
returns trigger
language plpgsql
security definer
set search_path = inventory
as $$
begin
  if new.type in ('adjustment', 'damage', 'expired') then
    perform core.write_audit_log(
      new.business_id, new.created_by, 'stock.adjusted', 'stock_movement', new.id, null,
      jsonb_build_object(
        'type', new.type, 'quantity', new.quantity, 'item_id', new.item_id,
        'warehouse_id', new.warehouse_id, 'reference', new.reference, 'reason', new.notes
      )
    );
  end if;
  return new;
end;
$$;

-- Named to sort alphabetically after a_apply_stock_movement/b_check_stock_alerts (all
-- three fire AFTER INSERT on the same table) -- Postgres runs same-event triggers in
-- name order; this one doesn't depend on the others' side effects, but keeps the file's
-- existing naming convention rather than introducing a different one.
create trigger c_log_stock_adjustment
  after insert on inventory.stock_movements
  for each row execute function inventory.log_stock_adjustment();
