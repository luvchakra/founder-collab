-- DISC-OFFER-P0-08.3: "Handoff Status" -- the doc's own "Not Sent / Sent to CRM /
-- Already in CRM / Handoff Failed" states. "Sent to CRM" and "Not Sent" are already
-- derivable from `opportunities.status` (05.1) and "Already in CRM" from a live CRM
-- read (08.3's own `getDiscoveryHandoffLead` contract call) -- neither needs a new
-- column. "Handoff Failed" is the one genuinely new fact this table doesn't carry
-- anywhere: an unexpected failure from a prior send attempt, needed so it survives a
-- page reload (not just a toast) and a founder can see it and retry.
alter table discovery.opportunities add column handoff_failed_at timestamptz;
alter table discovery.opportunities add column handoff_error text;
