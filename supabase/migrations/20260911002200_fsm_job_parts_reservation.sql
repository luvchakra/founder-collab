-- INT-03.2: "Reserve Parts for FSM Job" -- three columns recording the outcome of a
-- job's own reservation attempt (reserveJobParts(), module-fsm/src/lib/
-- inventory-integration/mutations.ts). Not a stock ledger: inventory.stock_movements
-- remains the only record of what actually moved, and inventory.stock_levels remains
-- the only authority on current quantity/reserved/available. This is a small,
-- FSM-owned fact about the job itself -- "what happened when this job tried to reserve
-- its parts" -- the same kind of thing job.status/job.on_hold_reason already are.
alter table fsm.jobs
  add column parts_reservation_status text check (parts_reservation_status in ('reserved', 'partially_reserved', 'unavailable')),
  add column parts_reservation_detail jsonb,
  add column parts_reservation_checked_at timestamptz;
