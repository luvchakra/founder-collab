-- PLATFORM-P0-11.2 ("System Email Templates", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §15). §15's own text: "Manage templates for: welcome / verification / password/security
-- events / subscription / usage limits / compliance reminders / system announcements."
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5) -- genuinely distinct from
-- `core.message_templates`**: `core.message_templates` (`20260908100000_core_messages.sql`,
-- 00-MASTER-PLAN.md §5's own "Message template" row) is `business_id`-scoped, freely
-- named (`unique (business_id, name)`, no fixed catalog) -- a *business's own* templates
-- for messaging *its own customers* (Kickserv-style messaging templates/reminders). This
-- story's "System Email Templates" are the opposite on every axis: WonderArc's own
-- transactional emails to *platform users* (a founder resetting their password, a business
-- owner told they hit a usage limit), never business_id-scoped, and a *fixed*, doc-named
-- catalog a superadmin edits the copy of, never creates/deletes an arbitrary new one of.
-- No overlap, no duplication -- confirmed by reading `core.message_templates`' own
-- migration, not assumed from the similar name.
--
-- **A fixed, seeded catalog, not an open create/delete surface -- same shape
-- `platform.ai_providers`/`platform.modules` already established**: §15's own bullet list
-- names exactly seven template purposes. `template_key` is a `text primary key` constrained
-- to those seven values (`password_security` for the doc's own "password/security events"
-- grouping -- one key, not two, matching the doc's own single bullet rather than inventing
-- a split the text doesn't ask for). No `create_email_template()`/`delete_email_template()`
-- function exists -- all seven rows are seeded once by this migration, matching
-- `platform.ai_providers`' own "insert once, never create/delete through the app" catalog
-- shape.
--
-- **Config-only, same accepted scope as PLATFORM-P0-11.1 -- no real email-sending code
-- reads this table**: see `20260912400000_platform_email_provider.sql`'s own docstring for
-- the full list of already-live Resend call sites this migration does not touch. None of
-- those dozen call sites currently render a template of any kind from the database --
-- `module-discovery`'s own `resend_template_id`/`resend_template_name` columns
-- (`20260907170000_discovery_messages_resend_templates.sql`) point at templates stored in
-- the founder's own *Resend account*, a different, tenant-scoped, BYOK-adjacent concept
-- entirely, not this table. Wiring any real send path to read from here is a future,
-- separate story's job, not this one's to invent (this run's own task brief's
-- stop-and-report trigger for unstated real-infrastructure wiring), matching PLATFORM-
-- P0-11.1's own explicit deferral.
--
-- **Subject/body are plain text, no templating-variable syntax defined or validated**:
-- §15 names no placeholder mechanism (e.g. `{{name}}`), and no consumer parses these
-- columns yet -- inventing one now would be exactly the kind of unstated-format
-- speculation `platform.ai_providers.rate_limits`/`cost_controls` already declined for
-- their own underspecified shape. A future wiring story defines and validates whatever
-- placeholder syntax its real renderer needs.
--
-- **Audited-write pattern, matching PLATFORM-P0-11.1's own `platform.email_provider`, not
-- `platform.branding`'s plain RLS-gated `.update()`**: this run's own higher security bar
-- applies here too -- the "password/security events" template in particular is a
-- textbook phishing target (an attacker who could edit its copy/links could turn WonderArc's
-- own password-reset email into a credential-harvesting vector for every business on the
-- platform). Every write goes through `platform.update_email_template()`, which requires a
-- non-empty reason and writes one `platform.email_template_events` audit row.
create table platform.email_templates (
  template_key text primary key check (template_key in (
    'welcome',
    'verification',
    'password_security',
    'subscription',
    'usage_limits',
    'compliance_reminders',
    'system_announcements'
  )),

  subject text check (subject is null or btrim(subject) <> ''),
  body text check (body is null or btrim(body) <> ''),

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index email_templates_updated_by_idx on platform.email_templates (updated_by);

-- Seed all seven, unconfigured (null subject/body) -- no fabricated copy, same "no
-- fabricated 'on' state for a brand-new surface" reasoning `platform.ai_providers.enabled
-- default false` already established. The fixed row set itself (not the content) is what
-- makes "manage templates for these seven purposes" a real, navigable catalog from day one.
insert into platform.email_templates (template_key) values
  ('welcome'),
  ('verification'),
  ('password_security'),
  ('subscription'),
  ('usage_limits'),
  ('compliance_reminders'),
  ('system_announcements');

create table platform.email_template_events (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  action text not null check (action = 'content_updated'),
  previous_value jsonb,
  new_value jsonb,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index email_template_events_template_key_idx on platform.email_template_events (template_key);
create index email_template_events_performed_by_idx on platform.email_template_events (performed_by);

alter table platform.email_templates enable row level security;
alter table platform.email_template_events enable row level security;

-- Superadmin-only read/write -- same reasoning as platform.email_provider: no real
-- rendering consumer exists yet to justify a wider `authenticated`-open SELECT the way
-- platform.ai_providers gave itself for a named future consumer; a future wiring story can
-- widen this grant then, if it turns out to need to.
create policy "superadmins can view email templates" on platform.email_templates
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.email_templates to authenticated;
grant all on platform.email_templates to service_role;

create policy "superadmins can view email template events" on platform.email_template_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.email_template_events to authenticated;
grant all on platform.email_template_events to service_role;

-- No direct INSERT/UPDATE/DELETE grant to `authenticated` -- every content change goes
-- through this one audited RPC, matching platform.email_provider's own shape. No insert/
-- delete function either -- the seven-row catalog is fixed, seeded once above.
create function platform.update_email_template(
  p_template_key text,
  p_subject text,
  p_body text,
  p_reason text
)
returns platform.email_templates
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.email_templates;
  v_row platform.email_templates;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change a system email template.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change a system email template.';
  end if;

  select * into v_prev from platform.email_templates where template_key = p_template_key for update;
  if not found then
    raise exception 'Unknown system email template: %', p_template_key;
  end if;

  update platform.email_templates
  set subject = p_subject,
      body = p_body,
      updated_by = auth.uid(),
      updated_at = now()
  where template_key = p_template_key
  returning * into v_row;

  insert into platform.email_template_events (template_key, action, previous_value, new_value, reason, performed_by)
  values (p_template_key, 'content_updated', to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_email_template(text, text, text, text) from public, anon;
grant execute on function platform.update_email_template(text, text, text, text) to authenticated;
