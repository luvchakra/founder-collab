-- CRM-SEC-CHANNELS-01: creating, changing or removing a CRM channel or a connected channel
-- account (Instagram, Messenger, Google) needed only CRM membership -- any member, a Viewer
-- included, could connect an account. It now also needs `channel_connections.manage`
-- (Owner and Admin by default), the permission WhatsApp connections already require.
-- Reading is unchanged. ALTER POLICY keeps the existing policies and their names.

alter policy "members can create channels in their licensed businesses" on crm.channels
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  );
alter policy "members can update channels in their licensed businesses" on crm.channels
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  );
alter policy "members can delete channels in their licensed businesses" on crm.channels
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  );

alter policy "members can create channel accounts in their licensed businesses" on crm.channel_accounts
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  );
alter policy "members can update channel accounts in their licensed businesses" on crm.channel_accounts
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  );
alter policy "members can delete channel accounts in their licensed businesses" on crm.channel_accounts
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
    and core.has_permission(business_id, 'channel_connections.manage')
  );
