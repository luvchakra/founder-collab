-- INT-03.4: "Technician Consumption -> Inventory" -- what a technician actually reports
-- using per material line (actual/returned/wasted, vs. the originally reserved
-- "planned" quantity). Snapshot of the last-recorded report, not a movement ledger:
-- inventory.stock_movements remains the only record of what actually moved.
alter table fsm.jobs
  add column parts_consumption jsonb,
  add column parts_consumption_recorded_at timestamptz;
