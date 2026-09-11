-- INT-04.1: "Opportunity Requires Assessment" -- a CRM commercial requirement, same
-- shape as INT-02.1's own fulfillment_requirement (nullable, human-set, never
-- auto-computed; null means "not yet gated").
alter table crm.opportunity
  add column assessment_requirement text check (assessment_requirement in ('none', 'remote', 'on_site', 'technical'));
