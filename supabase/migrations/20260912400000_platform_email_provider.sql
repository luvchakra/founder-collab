-- PLATFORM-P0-11.1 ("Email Provider", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §15).
--
-- §15's own text is four words each: "provider / from name / from email / reply-to".
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5) -- the "from name" duplicate-field
-- risk, resolved, not guessed**: PLATFORM-P0-03.1 already built `platform.branding.
-- email_from_name` under its own "Email Branding" section, and that story's own audit-log
-- entry said explicitly it was built "waiting for PLATFORM-P0-11 to plug into" -- i.e. this
-- story's own "from name" field IS that column, by the prior story's own stated design
-- intent, not a coincidental naming collision. Duplicating it into a second
-- `from_name`/`email_from_name` column here would create exactly the "two independently-
-- writable sources of truth" CLAUDE.md non-negotiable #5 warns against (which one would a
-- future email-sending consumer read for the From header?) -- so this migration adds NO
-- `from_name`-shaped column at all. `platform.branding.email_from_name` stays the one and
-- only place that value lives and is written; this table only adds the three fields §15
-- names that `platform.branding` genuinely does not already have (provider, from email,
-- reply-to) -- see `packages/core/src/admin/platform-email-provider.ts`'s own docstring for
-- how the application layer presents all four fields on one page without a second write
-- path for the one that already exists.
--
-- This is a materially narrower, single-axis question than PLATFORM-P0-09.3/10.1's own
-- stopped entries (which each compounded a duplicate-field question with a genuine, unstated
-- runtime-algorithm question -- BYOK precedence/failover semantics, or circuit-breaker
-- wiring + an undefined notification mechanism). Nothing here asks for real email-sending
-- infrastructure to be *built* -- and unlike the AI case, real email-sending infrastructure
-- already exists and is already live: `resend` (the npm package) is called directly, today,
-- from `module-discovery` (lib/messages/send.ts, lib/messages/resend-templates.ts,
-- lib/interest/notify.ts), `module-fsm` (lib/reminders, lib/customer-center, lib/invoices,
-- lib/estimates, lib/events, lib/messages), and `module-gst` (lib/reminders) -- roughly a
-- dozen call sites across three modules, every one reading `process.env.RESEND_API_KEY`/
-- `process.env.RESEND_FROM_EMAIL` directly (confirmed by grep, not assumed). None of that
-- is touched by this migration or by this story: exactly the same "config registry exists
-- alongside an already-live, unwired, env-var/hardcoded mechanism" split PLATFORM-P0-09.1
-- itself already established without stopping (`business-router.ts`'s own
-- `getPlatformCredential()` fallback was, and still is, hardcoded to `provider: "anthropic"`
-- reading `PLATFORM_AI_API_KEY`, untouched by 09.1's new `platform.ai_providers` registry
-- until 09.3's own later, separate wiring story). Actually redirecting any of those dozen
-- call sites to read from this new table -- or introducing a real SMTP/ESP-calling
-- abstraction they'd all switch to -- is exactly the kind of "real AI-calling []
-- infrastructure" analogue this run's own task brief calls out as a stop-and-report trigger
-- when the doc doesn't specify it, and §15's own field list says nothing about migrating
-- these call sites or unifying them behind one sender. So this migration is config-only, on
-- the same accepted precedent 09.1 set, not a claim that no live email path exists -- see
-- `packages/core/src/admin/platform-email-provider.ts` and the UI page's own copy for how
-- this gap is stated plainly to whoever configures this screen, not glossed over.
--
-- **Why `provider` is free text, not a closed enum (unlike `platform.ai_providers.
-- provider`)**: `AiProvider` (`packages/core/src/ai/model-registry.ts`) was already a real,
-- closed TS union backing actual (if single-provider-today) AI-calling code before
-- PLATFORM-P0-09.1 ever ran -- constraining the column to that union prevented configuring a
-- provider nothing could ever route to. No equivalent closed union, SDK integration, or
-- "email provider" concept of any kind exists anywhere in this codebase for email (grepped
-- for "sendgrid", "resend", "postmark", "ses", "mailgun", "nodemailer", "smtp" across the
-- whole repo -- zero hits outside this migration). Inventing a specific closed catalog of
-- named ESPs now, with no code anywhere that could ever send through any of them, would be
-- exactly the kind of speculative, no-consumer catalog CLAUDE.md development principle #7
-- rules out -- worse than platform.ai_providers' own choice, which at least mirrored a real
-- pre-existing union. A plain, non-empty text field records the operator's own choice of
-- label (e.g. "Resend", "SendGrid", "Amazon SES") without this migration fabricating which
-- names are "real" providers.
--
-- **Singleton, like `platform.branding`, not a per-provider row like `platform.
-- ai_providers`**: §15 describes ONE platform-wide email-sending configuration ("the"
-- provider, "the" from name/email/reply-to), never a list of providers to choose among at
-- send time (no "fallback provider" concept here, unlike PLATFORM-P0-10.3's own separate,
-- deferred "Primary -> Fallback -> Fail gracefully" idea for AI). A boolean primary key
-- fixed to `true` makes "there is exactly one platform email configuration" a property of
-- the column's own type, matching `platform.branding`'s own reasoning exactly.
--
-- **No secret/credential column this story**: unlike PLATFORM-P0-09.1, which explicitly
-- bundled "Secure API Key Storage" as its own named sub-story (09.2) into the same
-- migration, §15 has no equivalent "Email Provider Credentials" sub-story anywhere in this
-- section -- its own §15 field list is exactly the four config fields above, nothing about
-- an API key/SMTP password. PLATFORM-P0-12.4 ("Credential Separation": "Customer-owned
-- credentials and WonderArc-owned platform credentials must be separate") reads as the more
-- likely future home for actual per-integration secret storage (AI/Email/WhatsApp/
-- Payments/... all named together there) -- not this story's to guess at ahead of its own
-- turn. If a later story adds real credential storage for email, it is a new column/table
-- added then, following `platform.ai_provider_keys`' own zero-authenticated-grant,
-- SECURITY-DEFINER-only-read lockdown pattern -- not retrofitted here speculatively.
--
-- **Audited-write pattern, matching `platform.ai_providers`/`platform.
-- ai_feature_policies`, not `platform.branding`'s own plain RLS-gated `.update()`**: this
-- run's own task brief sets a higher security bar for this workstream, and unlike branding's
-- colors/copy, this table's `from_email`/`reply_to` values determine what a real recipient's
-- mail client displays as the sender/reply target of every platform-originated transactional
-- email once an email-sending system exists -- a live phishing/spoofing-adjacent surface, not
-- merely cosmetic. Every write goes through `platform.update_email_provider_config()`, which
-- requires a non-empty reason and writes one `platform.email_provider_events` audit row
-- (`to_jsonb(row)` snapshots are safe here -- no secret column exists on this table at all).
create table platform.email_provider (
  id boolean primary key default true check (id),

  provider text check (provider is null or btrim(provider) <> ''),
  from_email text check (from_email is null or from_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  reply_to text check (reply_to is null or reply_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index email_provider_updated_by_idx on platform.email_provider (updated_by);

-- Seed the singleton row unconfigured -- `provider`/`from_email`/`reply_to` all null, the
-- same "no fabricated 'on' state for a brand-new, never-configured surface" reasoning
-- `platform.ai_providers.enabled default false` already established. PLATFORM-P0-02.2's own
-- Configuration Health "email" category can read this row once it exists to flip from its
-- current honest `configured: false` -- not done in this migration (no caller change this
-- story asked for), but this is exactly the data that future read would need.
insert into platform.email_provider (id) values (true);

create table platform.email_provider_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action = 'config_updated'),
  previous_value jsonb,
  new_value jsonb,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index email_provider_events_performed_by_idx on platform.email_provider_events (performed_by);

alter table platform.email_provider enable row level security;
alter table platform.email_provider_events enable row level security;

-- Superadmin-only read/write, same shape as `platform.branding` -- no email-sending
-- consumer exists anywhere yet to justify a wider `authenticated`-open SELECT the way
-- `platform.ai_providers` gave itself in anticipation of PLATFORM-P0-09.3's own named
-- routing consumer; a future email-sending story can widen this grant then, if it turns out
-- to need to, rather than this story guessing that need now.
create policy "superadmins can view the email provider config" on platform.email_provider
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.email_provider to authenticated;
grant all on platform.email_provider to service_role;

create policy "superadmins can view email provider events" on platform.email_provider_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.email_provider_events to authenticated;
grant all on platform.email_provider_events to service_role;

-- No direct INSERT/UPDATE/DELETE grant to `authenticated` on either table -- every mutation
-- goes through this one audited RPC, matching `platform.ai_providers`' own
-- `update_ai_provider_config()` shape.
create function platform.update_email_provider_config(
  p_provider text,
  p_from_email text,
  p_reply_to text,
  p_reason text
)
returns platform.email_provider
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.email_provider;
  v_row platform.email_provider;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change the email provider configuration.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change the email provider configuration.';
  end if;

  select * into v_prev from platform.email_provider where id = true for update;

  update platform.email_provider
  set provider = p_provider,
      from_email = p_from_email,
      reply_to = p_reply_to,
      updated_by = auth.uid(),
      updated_at = now()
  where id = true
  returning * into v_row;

  insert into platform.email_provider_events (action, previous_value, new_value, reason, performed_by)
  values ('config_updated', to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_email_provider_config(text, text, text, text) from public, anon;
grant execute on function platform.update_email_provider_config(text, text, text, text) to authenticated;
