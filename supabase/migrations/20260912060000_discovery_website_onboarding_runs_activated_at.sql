-- DISC-OFFER-P0-09.4 "Offering Review Before Activation" -- "the user explicitly
-- activates the final offering list" needs a durable marker that this run's proposed
-- offerings were already turned into real discovery.products rows, so "Create Offerings"
-- can never double-fire (e.g. a page reload, a second click racing the first) and create
-- duplicate offerings for the same run. Null until the founder actually clicks "Create
-- Offerings"; no RLS change needed -- the existing "members can update website onboarding
-- runs in their businesses" policy (20260912000000) already covers writing this column.
alter table discovery.website_onboarding_runs
  add column activated_at timestamptz;
