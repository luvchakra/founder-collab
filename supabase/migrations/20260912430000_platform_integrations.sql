-- PLATFORM-P0-12.1/12.2/12.3/12.4 ("Global Integrations", docs/plan/09-PLATFORM-ADMIN-
-- PORTAL-BACKLOG.md §16).
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5), done before writing a line of
-- SQL**: grepped the codebase for every existing "integration"/credential concept before
-- assuming §16 is a clean, novel table. It is not clean -- six of its seven named
-- categories (AI/Email/WhatsApp/Payments/Government/Analytics/Storage) already have, or
-- deliberately do not have, real credential storage somewhere else in this codebase:
--   - **AI**       -- `platform.ai_providers`/`platform.ai_provider_keys` (PLATFORM-P0-09.1/
--     09.2, platform-owned) AND `discovery.ai_provider_credentials` (BYOK, customer-owned,
--     `discovery` schema -- master-plan §5's own `core.ai_provider_credentials` line is
--     stale; the live schema is discovery-scoped, per CLAUDE.md's "live source wins").
--   - **Email**    -- `platform.email_provider` (PLATFORM-P0-11.1, platform-owned only; no
--     customer-facing BYOK email/SMTP concept exists anywhere in this codebase).
--   - **WhatsApp** -- `crm.channel_accounts` (customer-owned; a business connects its own
--     WhatsApp Business/Instagram/Facebook/Google Business Messages account, encrypted
--     per-row with `core/crypto/api-key.ts`'s AES-256-GCM helper). No platform-level Meta
--     App credential exists anywhere -- `connectChannelAccount()` takes an already-obtained
--     access token straight from the business's own OAuth exchange, nothing shared.
--   - **Government** -- `gst.eway_bill_credentials`/`gst.einvoice_credentials`/
--     `gst.gstr2b_credentials` (customer-owned; each business supplies its own GSP
--     client-id/secret or username/password, same AES-256-GCM helper). No platform-level
--     GSP app credential exists either -- `gsp-client.ts` reads only a business's own row.
--   - **Payments** -- ALREADY BUILT, and platform-owned, not customer-owned (a real find
--     while checking the codebase before writing this migration -- a grep scoped to
--     `packages/`+`supabase/migrations/` alone missed it because it lives entirely under
--     `apps/web/app/api/billing/` + `packages/core/src/billing/`): `packages/core/src/
--     billing/razorpay.ts` calls Razorpay directly using WonderArc's OWN merchant
--     credentials (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` env
--     vars, `apps/web/.env.example`) to charge a BUSINESS for its own subscription plan
--     and AI-credit top-ups (`apps/web/app/api/billing/razorpay/*`, `core.ai_credit_
--     purchases`) -- money flows FROM a business TO WonderArc, the exact reverse
--     direction of a customer-owned integration. No per-business "connect your own
--     payment gateway to collect from your own customers" feature exists anywhere
--     (confirmed: no `payment_link`/business-scoped Razorpay credential of any kind) --
--     that would be the customer-owned dimension of this category, and it simply isn't
--     built. So `payments` seeds `platform_owned`/`connected` below, matching reality,
--     not the "nothing built" placeholder an incomplete grep would have suggested.
--   - **Storage** -- ALSO ALREADY BUILT, and platform-owned: `core.attachments`
--     (`packages/core/src/attachments/mutations.ts`) already uploads to this same
--     Supabase project's own Storage bucket (`supabase.storage.from("attachments")`) for
--     every job photo/product image/signed PDF/knowledge file across every module --
--     master-plan §5's own "Attachment... (Supabase Storage)" line names exactly this.
--     There is no separate "credential" for it (it rides the same Supabase session/
--     service-role auth every other query already uses, not a distinct third-party API
--     key) and no per-business "connect your own S3/Google Drive" feature exists --
--     `storage` seeds `platform_owned`/`connected` for the same reason `payments` does.
--   - **Analytics** -- genuinely not built. No product analytics/telemetry provider for
--     WonderArc's own use, and no per-business "connect your own GA/Meta Pixel" feature,
--     exist anywhere (confirmed by grep across the whole repo, not only `packages/`/
--     `supabase/migrations/` this time). `analytics` seeds `customer_owned`/`disconnected`
--     as a forward-looking placeholder for the latter (the only shape a per-business
--     analytics connection could take), with nothing live to contradict it.
--
-- So §16 is NOT asking for a second, competing place to store any of the above credentials
-- -- doing that would be exactly the "parallel table for an already-listed concept"
-- CLAUDE.md non-negotiable #5 forbids, and would also violate this very section's own
-- 12.4 ("Credential Separation: customer-owned credentials and WonderArc-owned platform
-- credentials must be separate") by merging both kinds into one place. What §16 IS asking
-- for -- and what nothing above already provides -- is a superadmin-facing REGISTRY: one
-- row per integration *category* (not per credential, not per business) recording which
-- ownership model applies and the category's own platform-wide operational status/kill
-- switch, mirroring `platform.modules` (PLATFORM-P0-07.1) doing the same job one level up
-- for whole modules. `platform.integrations` below holds ZERO credential columns -- no key,
-- token, secret, or client-id of any kind -- by construction, which is itself the concrete
-- enforcement of 12.4: the actual credentials keep living in the six places named above,
-- each already RLS-scoped exactly as CLAUDE.md non-negotiable #2 requires for a licensed
-- module's tables (or superadmin-only/zero-select for the platform-owned ones); this table
-- only ever describes them from a distance.
--
-- **Why `enabled` is a `GENERATED ALWAYS` column derived from `status`, not a second
-- independently-writable boolean, from this table's very first migration**: PLATFORM-P0-
-- 07.1/07.2/07.3 built `platform.modules.enabled` as its own column first, then needed a
-- whole separate reconciliation migration (`20260912220000_platform_module_status_
-- reconciliation.sql`) once maintenance-mode status was added, specifically to stop
-- `enabled` and `status` from being two independently-writable facts that could disagree.
-- `platform.integrations` starts with 12.2's status enum AND 12.3's kill switch on day one,
-- so there is no "day one" shape to regret -- `enabled` is derived from `status` from the
-- start, the same end state that reconciliation reached. `enabled = false` exactly when
-- `status = 'disabled'` (the kill-switched state); every other status counts as "the
-- integration category is currently reachable/offered."
--
-- **Why this is a dedicated `enabled`/`status` pair, not new rows in the *already-built*
-- `platform.feature_flags` (PLATFORM-P0-08.1-08.4)**: a real, deliberate judgment call, not
-- an oversight -- 08.3's own text even names some of the same subsystems ("AI research",
-- "WhatsApp integration", "government submission") as flag-based kill-switch candidates.
-- Decided in favor of a dedicated column here, for two reasons:
--   1. **Granularity mismatch.** 08.3's list (AI research / outbound messaging / WhatsApp
--      integration / government submission / expensive external APIs / new experimental
--      features) is a list of *operational behaviors*, not §16.1's list of *integration
--      categories* (AI / Email / WhatsApp / Payments / Government / Analytics / Storage).
--      They overlap in places (WhatsApp, roughly Government) but neither list is a subset
--      of the other -- Email/Payments/Analytics/Storage have no corresponding flag, and
--      "outbound messaging"/"expensive external APIs"/"new experimental features" have no
--      corresponding integration category. Force-fitting seven category rows onto flag
--      rows of a different shape would need lossy, partial mappings for most of them.
--   2. **This codebase already treats "coarse, dedicated kill switch" and "fine-grained
--      feature flag" as two legitimate, coexisting granularities, not duplicates of each
--      other** -- `platform.modules.status`/`enabled` (kill an entire module, dedicated
--      column) already coexists deliberately alongside `platform.feature_flags` (kill one
--      specific behavior, generic catalog), per that reconciliation migration's own
--      docstring. `platform.integrations.status`/`enabled` (kill one entire integration
--      category, dedicated column) is the exact same pattern one layer over: a coarser,
--      purpose-built control that composes with, rather than duplicates, the finer-grained
--      flag catalog a future story could still add on top for a specific behavior within a
--      category (e.g. a `whatsapp_bulk_broadcast` flag alongside this table's own coarse
--      `whatsapp` row) -- exactly as `08.1`'s migration itself already anticipated for
--      module-level vs flag-level control ("Both may describe similarly-named capabilities
--      for entirely different reasons").
--   This migration builds the registry, status enum, and audited kill switch only -- like
--   `platform.feature_flags` before it, no runtime enforcement is wired into any actual
--   integration call site (no PLATFORM-P0-12.5 "wire the kill switch into crm/gst code"
--   story exists in this doc), and this run's own file-scope boundary forbids touching
--   `module-crm`/`module-gst`/`module-discovery` regardless.
--
-- **`status` semantics for a customer-owned-only category (WhatsApp, Government)**: there
-- is no single platform-wide "connected" fact for a category where each business brings
-- its own credentials -- this column describes whether WonderArc currently *offers* the
-- category platform-wide, using 12.2's own five-value vocabulary, not any one business's
-- own connection state (that state already lives on `crm.channel_accounts.status`/the gst
-- credential rows themselves, per business, exactly where it belongs). `connected` here
-- means "operating normally, offered to every entitled business" (also the correct reading
-- for a platform-owned category like `payments`/`storage`, where WonderArc's own
-- credential either works for everyone or doesn't -- there is no per-business variance to
-- describe at all); `disconnected` means "not currently offered at all" (true today only
-- for `analytics` -- nothing exists yet for a business to use); `error`/
-- `needs_reauthorization` are available for a superadmin to set by hand when a widespread,
-- category-wide incident is known (e.g. a Meta API outage affecting every business's
-- WhatsApp account at once, or WonderArc's own Razorpay account itself needing
-- reauthorization) -- nothing computes these automatically, the same "manually-operated
-- status, not a live health check" shape `platform.modules.status` already established (no
-- automated monitoring infrastructure exists anywhere in this codebase to compute one, and
-- building it now would be exactly the speculative work CLAUDE.md development principle #7
-- rules out for a story that only asks to "show" status).
--
-- **Initial seed status for `ai`/`email` is computed, not hardcoded**, from whether a real
-- provider is actually configured in each table today (`platform.ai_provider_keys` having
-- any row / `platform.email_provider.provider` being non-null) -- the same "no fabricated
-- 'on' state" discipline `platform.ai_providers.enabled default false` and
-- `platform.email_provider`'s unconfigured seed row already established. `whatsapp`,
-- `government`, `payments`, and `storage` all seed `connected` (every one of the four is a
-- real, working feature today -- via `crm.channel_accounts`/the gst credential tables/
-- WonderArc's own Razorpay billing/Supabase Storage, respectively -- see this migration's
-- header comment for the payments/storage finding); only `analytics` seeds `disconnected`
-- (genuinely nothing built, on either side of the ownership line).
--
-- **Audit shape**: identical to `platform.module_status_events`/`platform.feature_flag_
-- events` -- one SECURITY DEFINER function (`platform.set_integration_status()`) owns
-- every transition, requires a non-empty `reason` unconditionally (12.3's kill switch is
-- the dangerous direction, but PLATFORM-P0-07.2/07.3's own bar already requires a reason in
-- BOTH directions of a flip, not only disabling), and writes one atomic
-- `platform.integration_status_events` row with a full previous/new snapshot. No direct
-- INSERT/UPDATE/DELETE grant to `authenticated` on either table -- the function is the only
-- path, same as every sibling audited mutation in this backlog.

create table platform.integrations (
  integration_key text primary key check (integration_key ~ '^[a-z0-9_]+$'),
  display_name text not null check (btrim(display_name) <> ''),

  -- 12.4's own distinction, made an explicit, queryable fact rather than left implicit in
  -- comments -- see this migration's own header comment for why 'both' applies to `ai`
  -- (platform-owned `platform.ai_provider_keys` AND customer-owned BYOK
  -- `discovery.ai_provider_credentials` both exist for this one category).
  credential_ownership text not null check (credential_ownership in ('platform_owned', 'customer_owned', 'both')),

  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error', 'needs_reauthorization', 'disabled')),
  -- Derived, never independently writable -- see this migration's own header comment for
  -- why this starts as a generated column instead of repeating platform.modules' own
  -- "column first, reconcile into `generated always` later" path.
  enabled boolean generated always as (status <> 'disabled') stored,

  -- A superadmin's own free-text operational note (e.g. "Meta API degraded, investigating"
  -- for an `error`/`needs_reauthorization` status) -- optional, length-capped the same
  -- defense-in-depth-under-the-database way every other free-text field in this backlog's
  -- platform.* tables already is.
  notes text check (notes is null or char_length(notes) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index integrations_updated_by_idx on platform.integrations (updated_by);

insert into platform.integrations (integration_key, display_name, credential_ownership, status) values
  ('ai', 'AI Providers', 'both',
    case when exists (select 1 from platform.ai_provider_keys) then 'connected' else 'disconnected' end),
  ('email', 'Email', 'platform_owned',
    case when exists (select 1 from platform.email_provider where provider is not null) then 'connected' else 'disconnected' end),
  ('whatsapp', 'WhatsApp', 'customer_owned', 'connected'),
  ('payments', 'Payments', 'platform_owned', 'connected'),
  ('government', 'Government', 'customer_owned', 'connected'),
  ('analytics', 'Analytics', 'customer_owned', 'disconnected'),
  ('storage', 'Storage', 'platform_owned', 'connected');

alter table platform.integrations enable row level security;

-- SELECT open to any authenticated user from the start -- same "table's own future
-- consumer runs as an ordinary signed-in business member, not a superadmin" reasoning
-- `platform.modules`/`platform.feature_flags` already used, applied in advance rather than
-- needing a second widening migration later. No credential data lives on this table at all
-- (see header comment), so an open read here creates no exposure beyond "which integration
-- categories exist and their current operational status," which is exactly what §16 asks
-- to "show." No INSERT/UPDATE/DELETE grant to `authenticated` at all -- every mutation goes
-- through `set_integration_status()` below; this is a fixed, seven-row catalog with no
-- "add/remove a category" operation §16 asks for, mirroring `platform.plans`' own closed-
-- catalog stance for tables nothing calls an insert/delete path for.
create policy "authenticated users can view the integration registry" on platform.integrations
  for select to authenticated
  using (true);

grant select on platform.integrations to authenticated;
grant all on platform.integrations to service_role;

create table platform.integration_status_events (
  id uuid primary key default gen_random_uuid(),
  integration_key text not null references platform.integrations (integration_key),
  previous_status text not null check (previous_status in ('connected', 'disconnected', 'error', 'needs_reauthorization', 'disabled')),
  new_status text not null check (new_status in ('connected', 'disconnected', 'error', 'needs_reauthorization', 'disabled')),
  previous_notes text,
  new_notes text,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index integration_status_events_integration_key_idx on platform.integration_status_events (integration_key);
create index integration_status_events_performed_by_idx on platform.integration_status_events (performed_by);

alter table platform.integration_status_events enable row level security;

-- Sensitive operational history, same trust level `platform.module_status_events`/
-- `platform.feature_flag_events` already established -- superadmin-only SELECT, no direct
-- write grant to `authenticated` at all.
create policy "superadmins can view integration status events" on platform.integration_status_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.integration_status_events to authenticated;
grant all on platform.integration_status_events to service_role;

create function platform.set_integration_status(
  p_integration_key text,
  p_status text,
  p_notes text,
  p_reason text
)
returns platform.integrations
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.integrations;
  v_row platform.integrations;
  v_new_notes text;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change an integration''s platform-wide status.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change an integration''s platform-wide status.';
  end if;
  if p_status not in ('connected', 'disconnected', 'error', 'needs_reauthorization', 'disabled') then
    raise exception 'Unknown integration status: %', p_status;
  end if;

  select * into v_prev from platform.integrations where integration_key = p_integration_key for update;
  if not found then
    raise exception 'Unknown integration key: %', p_integration_key;
  end if;

  v_new_notes := nullif(btrim(coalesce(p_notes, '')), '');

  update platform.integrations
  set status = p_status,
      notes = v_new_notes,
      updated_by = auth.uid(),
      updated_at = now()
  where integration_key = p_integration_key
  returning * into v_row;

  insert into platform.integration_status_events
    (integration_key, previous_status, new_status, previous_notes, new_notes, reason, performed_by)
  values
    (p_integration_key, v_prev.status, p_status, v_prev.notes, v_new_notes, btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.set_integration_status(text, text, text, text) from public, anon;
grant execute on function platform.set_integration_status(text, text, text, text) to authenticated;
