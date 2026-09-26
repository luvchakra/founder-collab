-- RBAC-39 (docs/design/rbac.md) -- declared hand-offs INTO CRM, now that CRM's tables
-- need CRM's own permissions (20260927050000). Each is keyed to the permission of the
-- module that initiates it; nothing else outside CRM can touch these tables.
--
--   Discovery "promote prospect to CRM"   (discovery.manage) -> lead insert/select
--   Discovery "log a prospect's reply"    (discovery.manage) -> conversation,
--       conversation_participant, interaction insert/select/update
--   Discovery "is this already a customer?" (discovery.manage) -> lead, opportunity select

create policy "discovery hand-off: create leads"
  on crm.lead for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', true)));
create policy "discovery hand-off: see leads"
  on crm.lead for select to authenticated
  using (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', false)));
create policy "discovery hand-off: see opportunities"
  on crm.opportunity for select to authenticated
  using (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', false)));

create policy "discovery hand-off: create conversations"
  on crm.conversation for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', true)));
create policy "discovery hand-off: update conversations"
  on crm.conversation for update to authenticated
  using (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', true)));
create policy "discovery hand-off: see conversations"
  on crm.conversation for select to authenticated
  using (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', false)));

create policy "discovery hand-off: create conversation participants"
  on crm.conversation_participant for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', true)));
create policy "discovery hand-off: see conversation participants"
  on crm.conversation_participant for select to authenticated
  using (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', false)));

create policy "discovery hand-off: create interactions"
  on crm.interaction for insert to authenticated
  with check (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', true)));
create policy "discovery hand-off: update interactions"
  on crm.interaction for update to authenticated
  using (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', true)));
create policy "discovery hand-off: see interactions"
  on crm.interaction for select to authenticated
  using (business_id in (select core.handoff_business_ids('crm', 'discovery.manage', false)));
