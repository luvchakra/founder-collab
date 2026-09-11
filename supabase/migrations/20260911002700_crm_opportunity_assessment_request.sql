-- INT-04.2: CRM's own one pointer to the FSM assessment it requested -- mirrors
-- fsm_opportunity_id/fulfillment_request_id exactly (bare uuid, no FK -- fsm.assessments
-- lives in another module's schema). Status/outcome are always read live through FSM's
-- contract, never cached here.
alter table crm.opportunity
  add column assessment_request_id uuid;
