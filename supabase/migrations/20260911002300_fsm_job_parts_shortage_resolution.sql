-- INT-03.3: "Parts Shortage -> FSM Exception" -- the human's explicit choice of how to
-- handle a job whose parts_reservation_status (INT-03.2) came back partially_reserved
-- or unavailable. Orthogonal to that column on purpose: parts_reservation_status stays
-- Inventory's own live truth about the reservation attempt, this records what the
-- founder decided to do about it -- never auto-computed, never overwrites the
-- reservation state itself.
alter table fsm.jobs
  add column parts_shortage_resolution text check (parts_shortage_resolution in ('await_replenishment', 'substitute_item', 'reschedule_job', 'obtain_manually')),
  add column parts_shortage_resolution_note text,
  add column parts_shortage_resolved_at timestamptz;
