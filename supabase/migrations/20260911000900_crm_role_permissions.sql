-- CRM-15.2: the backlog's own recommended CRM permission list, seeded the same way
-- every fsm/gst permission migration this session already has (C-7's own comment
-- explicitly anticipated this: "FSM/CRM/GST's own permission catalogs get seeded when
-- those modules' own stories build them"). `core.permissions.key` is a global primary
-- key, not scoped per module, so `crm_opportunities.manage`/`crm_messages.send`/
-- `crm_settings.manage` are prefixed specifically to avoid colliding with fsm's already-
-- seeded `opportunities.edit`/`messages.manage` and inventory's `settings.manage` --
-- every other key here has no existing collision, so it stays the plain
-- `<noun>.<verb>` shape this codebase already uses everywhere else.
insert into core.permissions (key, module, description) values
  ('crm.view', 'crm', 'View CRM records: conversations, pipeline, and the Potential Lost Business queue'),
  ('leads.manage', 'crm', 'Create, update, and assign leads'),
  ('crm_opportunities.manage', 'crm', 'Create, update, and assign CRM opportunities'),
  ('activities.manage', 'crm', 'Create and complete CRM activities, follow-ups, and tasks'),
  ('crm_messages.send', 'crm', 'Send WhatsApp replies and template messages'),
  ('channel_connections.manage', 'crm', 'Connect/disconnect channels and manage the WhatsApp template catalog'),
  ('reviews.publish', 'crm', 'Publish review responses'),
  ('analytics.view', 'crm', 'View CRM dashboards and analytics'),
  ('crm_settings.manage', 'crm', 'Manage CRM settings: routing rules and pipeline configuration')
on conflict (key) do nothing;

-- Owner/admin: every CRM permission, same as every other module's own migration grants
-- them (the base C-7 migration's owner/admin cross-join only covered permissions that
-- existed at that migration's own time, not ones seeded later).
insert into core.role_permissions (role, permission_key) values
  ('owner', 'crm.view'),
  ('owner', 'leads.manage'),
  ('owner', 'crm_opportunities.manage'),
  ('owner', 'activities.manage'),
  ('owner', 'crm_messages.send'),
  ('owner', 'channel_connections.manage'),
  ('owner', 'reviews.publish'),
  ('owner', 'analytics.view'),
  ('owner', 'crm_settings.manage'),
  ('admin', 'crm.view'),
  ('admin', 'leads.manage'),
  ('admin', 'crm_opportunities.manage'),
  ('admin', 'activities.manage'),
  ('admin', 'crm_messages.send'),
  ('admin', 'channel_connections.manage'),
  ('admin', 'reviews.publish'),
  ('admin', 'analytics.view'),
  ('admin', 'crm_settings.manage')
on conflict (role, permission_key) do nothing;

-- sales_manager (already one of StockPilot's six operational roles, C-7) is the
-- obvious day-to-day CRM operator -- gets the working-day permissions, not the
-- connection/settings configuration ones (channel_connections.manage,
-- crm_settings.manage stay owner/admin-only, same "configuration vs. operation" split
-- inventory's own sales_manager grant already draws between sales_orders.* and
-- settings.manage).
insert into core.role_permissions (role, permission_key) values
  ('sales_manager', 'crm.view'),
  ('sales_manager', 'leads.manage'),
  ('sales_manager', 'crm_opportunities.manage'),
  ('sales_manager', 'activities.manage'),
  ('sales_manager', 'crm_messages.send'),
  ('sales_manager', 'reviews.publish'),
  ('sales_manager', 'analytics.view')
on conflict (role, permission_key) do nothing;
