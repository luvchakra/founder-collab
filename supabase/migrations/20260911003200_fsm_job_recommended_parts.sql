-- INT-06.3: "Recommended Parts -> Inventory" -- FSM's own list of core.items references
-- a technician flagged for a future visit ("future parts demand"), not the current
-- job's own material requirement (that's INT-03.1's listJobMaterialRequirement(),
-- derived from the job's estimate -- a different, already-solved concept). Stores only
-- itemId + quantity ("no duplicate product records") -- name/SKU/price/availability are
-- always resolved live from core.items/Inventory's contract, never copied here.
alter table fsm.jobs
  add column recommended_parts jsonb,
  add column recommended_parts_recorded_at timestamptz;
