-- RBAC-06..RBAC-10, RBAC-13..RBAC-17 (RBAC-15: core.role_templates), RBAC-32, RBAC-36 -- invitations, member lifecycle,
-- custom roles and ownership transfer (docs/plan/15-MULTI-USER-RBAC-BACKLOG.md §10-§19,
-- §41-§47, §51).
--
-- Every change to who can do what goes through one SECURITY DEFINER function here. Each
-- one authenticates the caller (auth.uid()), checks the caller's permission *in that
-- business*, enforces the privilege ceiling (core.can_assign_role /
-- core.can_grant_permissions), runs in the function's single transaction, and writes
-- core.audit_log. There are no direct write grants on memberships, roles, grants or
-- invitations for signed-in users (the one exception, a creator's first owner row, is in
-- 20260926150000).

-- ---------------------------------------------------------------------------------------
-- Invitations (§16-§18)
-- ---------------------------------------------------------------------------------------

create table core.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_normalized text generated always as (lower(btrim(email))) stored,
  invited_name text check (invited_name is null or length(invited_name) <= 120),
  message text check (message is null or length(message) <= 500),
  role_id uuid not null references core.roles (id),
  invited_by uuid not null,
  -- SHA-256 of the token in the link. The token itself is never stored (§16, §18).
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index business_invitations_one_pending_idx on core.business_invitations (business_id, email_normalized) where status = 'pending';
create index business_invitations_business_status_idx on core.business_invitations (business_id, status);
create index business_invitations_email_status_idx on core.business_invitations (email_normalized, status);
create index business_invitations_role_idx on core.business_invitations (role_id);

alter table core.business_invitations enable row level security;
create policy "members who can invite see the business's invitations" on core.business_invitations
  for select to authenticated using (
    business_id in (select core.user_business_ids())
    and (core.has_business_permission(business_id, 'members.invite') or core.has_business_permission(business_id, 'members.view'))
  );
grant select on core.business_invitations to authenticated;
grant all on core.business_invitations to service_role;

-- ---------------------------------------------------------------------------------------
-- Role templates (§14) -- copied into a business on use; later edits to a template never
-- touch roles already created from it.
-- ---------------------------------------------------------------------------------------

create table core.role_templates (
  key text primary key,
  name text not null,
  description text not null,
  permission_keys text[] not null,
  display_order integer not null default 0
);
insert into core.role_templates (key, name, description, permission_keys, display_order) values
  ('business_admin', 'Business Admin', 'Runs the business day to day, including people and settings.',
    array['business.view','business.edit','business.settings.manage','members.view','members.invite','members.edit','members.suspend','members.roles.assign','discovery.view','marketing.view','marketing.manage','funding.view','inventory.view','service.view','crm.view','finance.view','billing.view'], 1),
  ('sales_manager', 'Sales Manager', 'Owns customers, pipeline and sales conversations.',
    array['business.view','discovery.view','crm.view','leads.manage','crm_opportunities.manage','crm_messages.send','activities.manage','analytics.view','customers.edit','inventory.view','sales_orders.edit','sales_orders.confirm','invoices.create'], 2),
  ('marketing_manager', 'Marketing Manager', 'Runs campaigns, content and marketing analytics.',
    array['business.view','discovery.view','marketing.view','marketing.manage','marketing.approve','marketing.export','crm.view','analytics.view'], 3),
  ('finance_manager', 'Finance Manager', 'Runs accounts, invoices, banking and tax.',
    array['business.view','finance.view','finance.reports.export','gst.accounts.write','gst.journal.create','gst.banking.manage','gst.manage_reconciliation','gst.generate','gst.file_returns','gst.periods.manage','invoices.create','invoices.edit','invoices.cancel','inventory.view','inventory.view_cost','billing.view'], 4),
  ('operations_manager', 'Operations Manager', 'Runs inventory and field operations.',
    array['business.view','inventory.view','inventory.edit','inventory.view_cost','purchase_orders.edit','purchase_orders.receive','stock_transfers.edit','stock_transfers.receive','suppliers.edit','service.view','jobs.edit','schedule.manage','schedule.print_work_orders','assessments.manage'], 5),
  ('field_technician', 'Field Technician', 'Works assigned jobs in the field.',
    array['business.view','service.view','jobs.edit','notes.edit','time_entries.edit','expenses.edit'], 6),
  ('accountant', 'Accountant', 'Works with invoices, finance and reports.',
    array['business.view','finance.view','finance.reports.export','invoices.create','invoices.edit','inventory.view','inventory.view_cost','gst.journal.create'], 7),
  ('viewer', 'Viewer', 'Read-only access to the modules the business uses.',
    array['business.view','discovery.view','marketing.view','funding.view','inventory.view','service.view','crm.view','finance.view'], 8);
-- Only keys that exist are ever copied (templates are filtered at use), so a template key
-- retired from the catalogue can't break role creation.
alter table core.role_templates enable row level security;
create policy "signed-in users can read role templates" on core.role_templates for select to authenticated using (true);
grant select on core.role_templates to authenticated;
grant all on core.role_templates to service_role;

-- ---------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------

create or replace function core.rbac_require(p_business_id uuid, p_key text)
returns void
language plpgsql
stable
security definer
set search_path = core
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not core.has_business_permission(p_business_id, p_key) then
    raise exception 'You don''t have permission to do that in this business.' using errcode = '42501';
  end if;
end;
$$;

create or replace function core.rbac_audit(
  p_business_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb
)
returns void
language sql
security definer
set search_path = core
as $$
  select core.write_audit_log(p_business_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after);
$$;

create or replace function core.role_is_owner(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  select exists (select 1 from core.roles where id = p_role_id and business_id is null and key = 'owner');
$$;

-- ---------------------------------------------------------------------------------------
-- Invitations (§16-§19, §43)
-- ---------------------------------------------------------------------------------------

create or replace function core.invite_member(
  p_business_id uuid,
  p_email text,
  p_invited_name text,
  p_role_id uuid,
  p_message text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = core
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  perform core.rbac_require(p_business_id, 'members.invite');
  if not core.can_assign_role(p_business_id, p_role_id) then
    raise exception 'You can''t invite someone with that role.' using errcode = '42501';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '14 days' then
    raise exception 'Invitations last between a moment and 14 days.' using errcode = '22023';
  end if;
  if exists (
    select 1 from core.business_members m join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id and lower(u.email) = v_email and m.status in ('active', 'suspended')
  ) then
    raise exception 'That person is already a member of this business.' using errcode = '23505';
  end if;
  -- §18 rate limits: per business and per inviter, per hour.
  if (select count(*) from core.business_invitations where business_id = p_business_id and created_at > now() - interval '1 hour') >= 50
     or (select count(*) from core.business_invitations where invited_by = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many invitations. Please try again later.' using errcode = '54000';
  end if;

  -- Re-inviting the same email replaces the pending invitation (the old link stops working).
  update core.business_invitations set status = 'revoked', revoked_at = now()
  where business_id = p_business_id and email_normalized = v_email and status = 'pending';

  insert into core.business_invitations (business_id, email, invited_name, role_id, invited_by, token_hash, message, expires_at)
  values (p_business_id, v_email, nullif(btrim(p_invited_name), ''), p_role_id, auth.uid(), p_token_hash, nullif(btrim(p_message), ''), p_expires_at)
  returning id into v_id;

  perform core.rbac_audit(p_business_id, 'member.invited', 'business_invitation', v_id, null,
    jsonb_build_object('email', v_email, 'role_id', p_role_id));
  return v_id;
end;
$$;

-- What the accept page shows, before the invitee commits. Only to the signed-in user the
-- invitation was addressed to; anything else (wrong account, used, revoked, expired) comes
-- back as a status with no business details.
create or replace function core.get_invitation(p_token_hash text)
returns table (status text, business_name text, role_name text, invited_by_name text, email text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = core
as $$
declare
  v_inv core.business_invitations;
  v_user_email text;
begin
  select lower(u.email) into v_user_email from auth.users u where u.id = auth.uid();
  select * into v_inv from core.business_invitations where token_hash = p_token_hash;
  if v_inv.id is null then
    return query select 'invalid'::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  if v_inv.email_normalized is distinct from v_user_email then
    return query select 'wrong_account'::text, null::text, null::text, null::text, v_inv.email, null::timestamptz;
    return;
  end if;
  return query
    select case when v_inv.status = 'pending' and v_inv.expires_at <= now() then 'expired' else v_inv.status end,
           b.name, r.name, coalesce(p.full_name, 'A team member'), v_inv.email, v_inv.expires_at
    from core.businesses b, core.roles r left join core.user_profiles p on p.id = v_inv.invited_by
    where b.id = v_inv.business_id and r.id = v_inv.role_id;
end;
$$;

create or replace function core.accept_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = core
as $$
declare
  v_inv core.business_invitations;
  v_user_email text;
  v_member core.business_members;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  select lower(email) into v_user_email from auth.users where id = auth.uid();
  -- Locked: two tabs accepting at once make one membership (§55 duplicate acceptance).
  select * into v_inv from core.business_invitations where token_hash = p_token_hash for update;
  if v_inv.id is null or v_inv.email_normalized is distinct from v_user_email then
    raise exception 'This invitation isn''t valid for your account.' using errcode = '42501';
  end if;
  if v_inv.status = 'accepted' and v_inv.accepted_by = auth.uid() then
    return v_inv.business_id;
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invitation is no longer valid.' using errcode = '42501';
  end if;
  if v_inv.expires_at <= now() then
    update core.business_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'This invitation has expired. Ask for a new one.' using errcode = '42501';
  end if;
  if exists (select 1 from core.roles where id = v_inv.role_id and archived_at is not null) then
    raise exception 'The role on this invitation was archived. Ask for a new invitation.' using errcode = '42501';
  end if;

  select * into v_member from core.business_members where business_id = v_inv.business_id and user_id = auth.uid();
  if v_member.id is null then
    insert into core.business_members (business_id, user_id, role_id, role, status, invited_at, invited_by, joined_at)
    values (v_inv.business_id, auth.uid(), v_inv.role_id, 'viewer', 'active', v_inv.created_at, v_inv.invited_by, now());
  elsif v_member.status = 'removed' then
    update core.business_members
    set role_id = v_inv.role_id, status = 'active', removed_at = null, suspended_at = null,
        invited_at = v_inv.created_at, invited_by = v_inv.invited_by, joined_at = now()
    where id = v_member.id;
  elsif v_member.status = 'suspended' then
    -- An invitation is not a way around a suspension.
    raise exception 'Your access to this business is suspended. Contact an administrator.' using errcode = '42501';
  end if;
  -- An already-active member keeps their role; the invitation is simply used up.

  update core.business_invitations set status = 'accepted', accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  perform core.rbac_audit(v_inv.business_id, 'member.invitation_accepted', 'business_invitation', v_inv.id, null,
    jsonb_build_object('role_id', v_inv.role_id));
  insert into core.domain_events (business_id, type, payload)
  values (v_inv.business_id, 'member.invitation_accepted', jsonb_build_object('user_id', auth.uid(), 'invited_by', v_inv.invited_by, 'role_id', v_inv.role_id));
  return v_inv.business_id;
end;
$$;

create or replace function core.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_inv core.business_invitations;
begin
  select * into v_inv from core.business_invitations where id = p_invitation_id for update;
  if v_inv.id is null then
    raise exception 'Invitation not found.' using errcode = 'P0002';
  end if;
  perform core.rbac_require(v_inv.business_id, 'members.invite');
  if v_inv.status <> 'pending' then
    return;
  end if;
  update core.business_invitations set status = 'revoked', revoked_at = now() where id = v_inv.id;
  perform core.rbac_audit(v_inv.business_id, 'member.invitation_revoked', 'business_invitation', v_inv.id, null, jsonb_build_object('email', v_inv.email));
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Member lifecycle (§10, §11, §41, §44, §45)
-- ---------------------------------------------------------------------------------------

create or replace function core.change_member_role(p_member_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_member core.business_members;
  v_actor_owner boolean;
begin
  select * into v_member from core.business_members where id = p_member_id for update;
  if v_member.id is null then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  perform core.rbac_require(v_member.business_id, 'members.roles.assign');
  if v_member.user_id = auth.uid() then
    raise exception 'You can''t change your own role.' using errcode = '42501';
  end if;
  v_actor_owner := core.role_is_owner(core.current_role_id(v_member.business_id));
  if core.role_is_owner(v_member.role_id) and not v_actor_owner then
    raise exception 'Only an owner can change an owner''s role.' using errcode = '42501';
  end if;
  if core.role_is_owner(p_role_id) then
    raise exception 'Use ownership transfer to make someone an owner.' using errcode = '42501';
  end if;
  if not core.can_assign_role(v_member.business_id, p_role_id) then
    raise exception 'You can''t assign that role.' using errcode = '42501';
  end if;
  if v_member.role_id = p_role_id then
    return;
  end if;
  update core.business_members set role_id = p_role_id where id = v_member.id;
  perform core.rbac_audit(v_member.business_id, 'member.role_changed', 'business_member', v_member.id,
    jsonb_build_object('role_id', v_member.role_id), jsonb_build_object('role_id', p_role_id, 'user_id', v_member.user_id));
  insert into core.domain_events (business_id, type, payload)
  values (v_member.business_id, 'member.role_changed', jsonb_build_object('user_id', v_member.user_id, 'role_id', p_role_id));
end;
$$;

create or replace function core.set_member_status(p_member_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_member core.business_members;
begin
  if p_status not in ('active', 'suspended', 'removed') then
    raise exception 'Unknown member status.' using errcode = '22023';
  end if;
  select * into v_member from core.business_members where id = p_member_id for update;
  if v_member.id is null then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  perform core.rbac_require(v_member.business_id, case when p_status = 'removed' then 'members.remove' else 'members.suspend' end);
  if v_member.user_id = auth.uid() then
    raise exception 'You can''t change your own access.' using errcode = '42501';
  end if;
  if core.role_is_owner(v_member.role_id) and not core.role_is_owner(core.current_role_id(v_member.business_id)) then
    raise exception 'Only an owner can suspend or remove an owner.' using errcode = '42501';
  end if;
  -- An admin can't act on someone whose role carries permissions the admin lacks.
  if not core.can_assign_role(v_member.business_id, v_member.role_id) and not core.role_is_owner(v_member.role_id) then
    raise exception 'You can''t manage a member with more access than you.' using errcode = '42501';
  end if;
  if v_member.status = p_status then
    return;
  end if;
  update core.business_members
  set status = p_status,
      suspended_at = case when p_status = 'suspended' then now() else null end,
      removed_at = case when p_status = 'removed' then now() else null end
  where id = v_member.id;
  perform core.rbac_audit(v_member.business_id,
    case p_status when 'suspended' then 'member.suspended' when 'removed' then 'member.removed' else 'member.reactivated' end,
    'business_member', v_member.id,
    jsonb_build_object('status', v_member.status), jsonb_build_object('status', p_status, 'user_id', v_member.user_id, 'reason', nullif(btrim(p_reason), '')));
  insert into core.domain_events (business_id, type, payload)
  values (v_member.business_id,
    case p_status when 'suspended' then 'member.suspended' when 'removed' then 'member.removed' else 'member.reactivated' end,
    jsonb_build_object('user_id', v_member.user_id));
end;
$$;

-- §44 -- the one way ownership moves: current owner, an existing active member, explicit.
create or replace function core.transfer_ownership(p_business_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_target core.business_members;
  v_actor core.business_members;
  v_owner uuid := (select id from core.roles where business_id is null and key = 'owner');
  v_admin uuid := (select id from core.roles where business_id is null and key = 'admin');
begin
  select * into v_actor from core.business_members where business_id = p_business_id and user_id = auth.uid() and status = 'active' for update;
  if v_actor.id is null or v_actor.role_id <> v_owner then
    raise exception 'Only an owner can transfer ownership.' using errcode = '42501';
  end if;
  select * into v_target from core.business_members where id = p_member_id and business_id = p_business_id for update;
  if v_target.id is null or v_target.status <> 'active' or v_target.user_id = auth.uid() then
    raise exception 'Ownership can only move to another active member of this business.' using errcode = '42501';
  end if;
  update core.business_members set role_id = v_owner where id = v_target.id;
  update core.business_members set role_id = v_admin where id = v_actor.id;
  perform core.rbac_audit(p_business_id, 'ownership.transferred', 'business_member', v_target.id,
    jsonb_build_object('owner_user_id', v_actor.user_id), jsonb_build_object('owner_user_id', v_target.user_id));
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Custom roles (§13-§15, §42)
-- ---------------------------------------------------------------------------------------

create or replace function core.validate_role_permissions(p_business_id uuid, p_keys text[])
returns text[]
language plpgsql
stable
security definer
set search_path = core
as $$
declare
  v_keys text[] := coalesce((select array_agg(distinct k order by k) from unnest(p_keys) k), '{}');
  v_unknown text;
begin
  select k into v_unknown from unnest(v_keys) k where not exists (select 1 from core.permissions where key = k) limit 1;
  if v_unknown is not null then
    raise exception 'Unknown permission: %', v_unknown using errcode = '22023';
  end if;
  if not core.can_grant_permissions(p_business_id, v_keys) then
    raise exception 'You can only grant permissions you have yourself.' using errcode = '42501';
  end if;
  return v_keys;
end;
$$;

create or replace function core.create_role(
  p_business_id uuid, p_name text, p_description text, p_permission_keys text[], p_template_key text
)
returns uuid
language plpgsql
security definer
set search_path = core
as $$
declare
  v_keys text[];
  v_key text;
  v_id uuid;
  v_suffix integer := 1;
begin
  perform core.rbac_require(p_business_id, 'members.roles.manage');
  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 80 then
    raise exception 'Give the role a name (up to 80 characters).' using errcode = '22023';
  end if;
  if p_template_key is not null and p_permission_keys is null then
    select array(select k from unnest(t.permission_keys) k where exists (select 1 from core.permissions where key = k))
      into p_permission_keys from core.role_templates t where t.key = p_template_key;
  end if;
  v_keys := core.validate_role_permissions(p_business_id, coalesce(p_permission_keys, '{}'));
  if exists (select 1 from core.roles where business_id = p_business_id and lower(name) = lower(btrim(p_name)) and archived_at is null) then
    raise exception 'A role with that name already exists.' using errcode = '23505';
  end if;
  v_key := left(trim(both '_' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '_', 'g')), 50);
  if v_key !~ '^[a-z]' then v_key := 'role_' || v_key; end if;
  if length(v_key) < 2 then v_key := 'role_' || v_key; end if;
  -- Stable, unique key; system role keys stay reserved.
  while exists (select 1 from core.roles where (business_id = p_business_id or business_id is null) and key = v_key || case when v_suffix = 1 then '' else '_' || v_suffix end) loop
    v_suffix := v_suffix + 1;
  end loop;
  if v_suffix > 1 then v_key := v_key || '_' || v_suffix; end if;

  insert into core.roles (business_id, key, name, description, role_type, template_key, created_by)
  values (p_business_id, v_key, btrim(p_name), nullif(btrim(p_description), ''), 'custom', p_template_key, auth.uid())
  returning id into v_id;
  insert into core.role_permission_grants (role_id, permission_key) select v_id, k from unnest(v_keys) k;
  perform core.rbac_audit(p_business_id, 'role.created', 'role', v_id, null,
    jsonb_build_object('name', btrim(p_name), 'permissions', to_jsonb(v_keys), 'template', p_template_key));
  return v_id;
end;
$$;

create or replace function core.update_role(p_role_id uuid, p_name text, p_description text, p_permission_keys text[])
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_role core.roles;
  v_before text[];
  v_keys text[];
begin
  select * into v_role from core.roles where id = p_role_id for update;
  if v_role.id is null or v_role.business_id is null then
    raise exception 'System roles can''t be edited. Create a custom role instead.' using errcode = '42501';
  end if;
  perform core.rbac_require(v_role.business_id, 'members.roles.manage');
  if v_role.archived_at is not null then
    raise exception 'That role is archived.' using errcode = '42501';
  end if;
  select coalesce(array_agg(permission_key order by permission_key), '{}') into v_before from core.role_permission_grants where role_id = v_role.id;
  -- The ceiling applies to what is being added *and* to editing a role that already holds
  -- more than the editor may grant (§12).
  if not core.can_grant_permissions(v_role.business_id, v_before) then
    raise exception 'This role has permissions you can''t grant, so you can''t edit it.' using errcode = '42501';
  end if;
  v_keys := core.validate_role_permissions(v_role.business_id, coalesce(p_permission_keys, '{}'));
  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 80 then
    raise exception 'Give the role a name (up to 80 characters).' using errcode = '22023';
  end if;
  if exists (select 1 from core.roles where business_id = v_role.business_id and id <> v_role.id and lower(name) = lower(btrim(p_name)) and archived_at is null) then
    raise exception 'A role with that name already exists.' using errcode = '23505';
  end if;

  update core.roles set name = btrim(p_name), description = nullif(btrim(p_description), ''), updated_at = now() where id = v_role.id;
  delete from core.role_permission_grants where role_id = v_role.id;
  insert into core.role_permission_grants (role_id, permission_key) select v_role.id, k from unnest(v_keys) k;
  perform core.rbac_audit(v_role.business_id,
    case when v_before = v_keys then 'role.updated' else 'role.permissions_changed' end,
    'role', v_role.id,
    jsonb_build_object('name', v_role.name, 'permissions', to_jsonb(v_before)),
    jsonb_build_object('name', btrim(p_name), 'permissions', to_jsonb(v_keys)));
end;
$$;

create or replace function core.archive_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_role core.roles;
  v_in_use integer;
begin
  select * into v_role from core.roles where id = p_role_id for update;
  if v_role.id is null or v_role.business_id is null then
    raise exception 'System roles can''t be archived.' using errcode = '42501';
  end if;
  perform core.rbac_require(v_role.business_id, 'members.roles.manage');
  select count(*) into v_in_use from core.business_members where role_id = v_role.id and status in ('active', 'suspended', 'invited');
  if v_in_use > 0 then
    raise exception 'Reassign % % before archiving this role.', v_in_use, case when v_in_use = 1 then 'user' else 'users' end using errcode = '23503';
  end if;
  update core.roles set archived_at = now(), updated_at = now() where id = v_role.id and archived_at is null;
  update core.business_invitations set status = 'revoked', revoked_at = now() where role_id = v_role.id and status = 'pending';
  perform core.rbac_audit(v_role.business_id, 'role.archived', 'role', v_role.id, null, jsonb_build_object('name', v_role.name));
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'core.rbac_require(uuid, text)',
    'core.rbac_audit(uuid, text, text, uuid, jsonb, jsonb)',
    'core.role_is_owner(uuid)',
    'core.invite_member(uuid, text, text, uuid, text, text, timestamptz)',
    'core.get_invitation(text)',
    'core.accept_invitation(text)',
    'core.revoke_invitation(uuid)',
    'core.change_member_role(uuid, uuid)',
    'core.set_member_status(uuid, text, text)',
    'core.transfer_ownership(uuid, uuid)',
    'core.validate_role_permissions(uuid, text[])',
    'core.create_role(uuid, text, text, text[], text)',
    'core.update_role(uuid, text, text, text[])',
    'core.archive_role(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
  foreach f in array array[
    'core.role_is_owner(uuid)',
    'core.invite_member(uuid, text, text, uuid, text, text, timestamptz)',
    'core.get_invitation(text)',
    'core.accept_invitation(text)',
    'core.revoke_invitation(uuid)',
    'core.change_member_role(uuid, uuid)',
    'core.set_member_status(uuid, text, text)',
    'core.transfer_ownership(uuid, uuid)',
    'core.create_role(uuid, text, text, text[], text)',
    'core.update_role(uuid, text, text, text[])',
    'core.archive_role(uuid)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
