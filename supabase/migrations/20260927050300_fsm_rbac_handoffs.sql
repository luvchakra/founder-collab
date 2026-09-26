-- RBAC-39 (docs/design/rbac.md) -- declared hand-offs INTO Service (fsm), now that its
-- tables need Service's own permissions (20260927050000). Each is keyed to the permission
-- of the module that initiates it.
--
--   CRM "create FSM quote"            (crm_opportunities.manage) -> opportunities insert/select/update
--   CRM "request an assessment"       (crm_opportunities.manage) -> assessments insert/select
--   CRM "accept quote, create job"    (crm_opportunities.manage) -> jobs insert/select
--   Discovery "hand won prospect to Service" (discovery.manage)  -> opportunities insert/select,
--                                                                   jobs select (hand-off status)

create policy "crm hand-off: create service opportunities"
  on fsm.opportunities for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('fsm', 'crm_opportunities.manage', true)));
create policy "crm hand-off: update service opportunities"
  on fsm.opportunities for update to authenticated
  using (business_id in (select core.handoff_business_ids('fsm', 'crm_opportunities.manage', true)));
create policy "crm hand-off: see service opportunities"
  on fsm.opportunities for select to authenticated
  using (business_id in (select core.handoff_business_ids('fsm', 'crm_opportunities.manage', false)));

create policy "crm hand-off: create assessments"
  on fsm.assessments for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('fsm', 'crm_opportunities.manage', true)));
create policy "crm hand-off: see assessments"
  on fsm.assessments for select to authenticated
  using (business_id in (select core.handoff_business_ids('fsm', 'crm_opportunities.manage', false)));

create policy "crm hand-off: create jobs"
  on fsm.jobs for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('fsm', 'crm_opportunities.manage', true)));
create policy "crm hand-off: see jobs"
  on fsm.jobs for select to authenticated
  using (business_id in (select core.handoff_business_ids('fsm', 'crm_opportunities.manage', false)));

create policy "discovery hand-off: create service opportunities"
  on fsm.opportunities for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('fsm', 'discovery.manage', true)));
create policy "discovery hand-off: see service opportunities"
  on fsm.opportunities for select to authenticated
  using (business_id in (select core.handoff_business_ids('fsm', 'discovery.manage', false)));
create policy "discovery hand-off: see jobs"
  on fsm.jobs for select to authenticated
  using (business_id in (select core.handoff_business_ids('fsm', 'discovery.manage', false)));
