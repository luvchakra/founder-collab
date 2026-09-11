-- CRM-04.3: "Opportunity Value & Close Date." estimated_value/currency/probability/
-- expected_close_date are new; owner (owner_id) and source already existed from
-- CRM-01.2. "Primary product(s)" is explicitly CRM-04.4's own story (Multiple Products
-- per Opportunity), not duplicated here.
alter table crm.opportunity
  add column estimated_value numeric(14, 2),
  add column currency text not null default 'INR',
  add column probability integer,
  add column expected_close_date date,
  add constraint opportunity_probability_range check (probability is null or (probability >= 0 and probability <= 100));
