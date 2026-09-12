-- PLATFORM-P0-11.3 ("Notification Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §15). §15's own text: "Configure platform defaults for: email / in-app / push."
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5)**: `docs/plan/00-MASTER-PLAN.md`
-- §5 lists the canonical home for the "Notification" concept as `core.notifications` +
-- `core.notification_prefs` -- but neither table exists anywhere in this codebase yet
-- (grepped the full migration timeline for both names -- zero hits, confirmed, not
-- assumed). So there is no existing table this migration could duplicate today. What this
-- story asks for is also a different concept on its own terms even once that future pair
-- is built: "platform defaults" reads as WonderArc's own operator-level policy for which
-- channels are available/on by default across the whole platform, not a `business_id`- or
-- `user_id`-scoped preference row (which is what `core.notification_prefs`, when it is
-- eventually built, would own -- an individual user's own choice to mute a channel).
-- Mirrors the same "platform operator config vs. tenant-scoped data" split
-- `platform.plans` already draws against `core.licenses`/`core.business_settings.plan`,
-- and `platform.ai_providers` draws against `core.ai_provider_credentials` (BYOK) -- a
-- platform-schema table naming a concept a future `core`-schema table will also touch is
-- not automatically a duplicate, provided (as here) the two operate at genuinely different
-- scopes and neither exists to collide with today.
--
-- **Config-only, same accepted scope as PLATFORM-P0-11.1/11.2**: no in-app or push
-- notification delivery mechanism exists anywhere in this codebase (grepped for "in-app
-- notif", "push notif", "notification_pref" -- zero hits outside doc/plan text); email is
-- the one channel with any real live sending path at all (Resend, catalogued in full in
-- `20260912400000_platform_email_provider.sql`'s own docstring), and even that path reads
-- nothing from this table. This migration stores three platform-wide default toggles with
-- no runtime consumer, the same "registry now, real wiring later" scope 09.1/11.1/11.2
-- already established -- see `packages/core/src/admin/platform-notification-policies.ts`'s
-- own docstring and the admin page's own copy for how this gap is stated plainly.
--
-- **All three default to `false`, not "email true, the rest false"**: even though email is
-- the only channel with any real infrastructure elsewhere in this codebase today, this
-- table is a brand-new, never-before-configured surface -- the same "no fabricated 'on'
-- state" reasoning `platform.ai_providers.enabled default false` already applied even
-- though `anthropic` is this platform's own real, currently-used AI provider. A superadmin
-- who wants email defaulted on says so explicitly; this migration does not guess it for
-- them.
--
-- **Singleton, plain RLS-gated update, not the audited-RPC pattern PLATFORM-P0-11.1/11.2
-- used**: a deliberate, documented judgment call (this run's own task brief marks "which
-- existing pattern to reuse" as a non-security call the implementer may make and record).
-- Unlike `from_email`/`reply_to` (a real phishing/spoofing-adjacent surface once email
-- sends read them) or template `body` content (a literal injection point for a
-- password-reset email's own links), three boolean channel-default toggles carry no
-- comparable payload an attacker could weaponize by changing them -- the worst a malicious
-- flip does is silently disable a notification channel, not impersonate WonderArc or
-- inject content into a security-critical email. This matches `platform.branding`'s own
-- plain `select`/`update` RLS shape (superadmin read/write is literally the whole ask, no
-- separate audit table) rather than `platform.ai_providers`/`platform.email_provider`/
-- `platform.email_templates`'s heavier audited-function shape.
create table platform.notification_policies (
  id boolean primary key default true check (id),

  email_enabled boolean not null default false,
  in_app_enabled boolean not null default false,
  push_enabled boolean not null default false,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index notification_policies_updated_by_idx on platform.notification_policies (updated_by);

-- Seed unconfigured (all three false) -- see this migration's own header comment.
insert into platform.notification_policies (id) values (true);

alter table platform.notification_policies enable row level security;

create policy "superadmins can view notification policies" on platform.notification_policies
  for select to authenticated
  using (platform.is_superadmin());

create policy "superadmins can update notification policies" on platform.notification_policies
  for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

grant select, update on platform.notification_policies to authenticated;
grant all on platform.notification_policies to service_role;
