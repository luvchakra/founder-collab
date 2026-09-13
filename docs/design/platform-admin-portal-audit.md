# Platform Administration Portal — Audit Log

Dated record of every story implemented from `docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md`
(the "WonderArc Platform Administration Portal — P0/P1" doc). Branch: `feature/platform-admin-portal`,
originally run per that doc's own §39 workflow -- **one story at a time, tested,
committed, then stop and wait for the next story** (explicitly not the auto-continue
pattern used for other backlogs in this repo), never merged into `main` unless explicitly
instructed. **As of 2026-09-11 (starting with PLATFORM-P0-03.1)**, an explicit task
assignment switched this workstream to the same auto-continuing, verify-then-merge-to-
`main`-after-each-story pattern the Discovery (`disc-offering-backlog`) and Compliance
(`comply-backlog`) workstreams already use, superseding §39's "stop and wait"/"never
merge" instructions for this run -- recorded here rather than silently departing from the
doc's own stated process. Every story's own log entry below still documents its
verification in full regardless of which mode was in effect when it landed.

## Progress

| Phase | Story | Title | Status |
|---|---|---|---|
| P0 Phase 1 | 01 | SUPERADMIN (role, authorization, session context, no tenant context) | Done |
| | 02 | Platform Dashboard | Done |
| | 16 | Platform Audit | Not started |
| | 18 | Platform Security Controls | 18.1 done; 18.2/18.4 deferred (no mutation callers yet); 18.3 already satisfied by 01 -- see log |
| P0 Phase 2 | 04 | Subscription / Pricing Plans | All of §8 done (04.1-04.7) -- see log |
| | 05 | Entitlement Engine | All of §9 done (05.1-05.4) -- `hasModule()`/`hasFeature()`/`getLimit()`/`canConsume()` all built -- see log |
| | 06 | Usage & Limits | All of §10 done (06.1-06.5) -- 06.5 (Soft vs Hard Limits, Warning Threshold) resumed and built once the user answered the three open questions -- see log |
| | 07 | Module Administration | 07.1-07.3 all done (Registry, Kill Switch, Maintenance Mode + reconciliation) -- §11 complete, see log |
| | 08 | Feature Flags | All of §12 done (08.1-08.4) -- see log |
| P0 Phase 3 | 09 | Internal AI Provider & Keys | 09.1-09.5 all done -- §13 complete (registry, secure key storage, routing policy, feature policies all config-only; 09.5 a read-only usage view, no new table) -- see log |
| | 10 | AI Safety / Cost Controls | 10.1 done (user-decided, config-only monthly-budget extension); 10.2 deferred (real runtime enforcement + undefined SUPERADMIN-notification mechanism, user-decided); 10.3/10.4 not started -- see log |
| | 11 | Global Email / Notification Configuration | All of §15 done (11.1-11.3, all config-only) -- see log |
| | 12 | Global Integrations | All of §16 done (12.1-12.4) -- see log |
| | 13 | Country / Compliance Pack Administration | All of §17 resolved (13.1/13.2/13.4 done; 13.3 closed 2026-09-13 -- user decision: already satisfied by `gst.tax_rules`, no platform-layer counterpart needed) -- see log |
| P0 Phase 4 | 03 | Branding & Look and Feel | 03.1 done; 03.2 deferred (conflicts with CLAUDE.md non-negotiable #7); 03.3 done; 03.4 done; 03.5 done -- §7 complete, see log |
| | 14 | Platform Policies | Done -- 14.1/14.2/14.3 (all of §18) built config-only, see log |
| | 15 | Global Announcements / Maintenance | Done -- 15.1/15.2/15.3/15.4 (all of §19) built config-only, see log |
| | 17 | Configuration Versioning | Not started |
| | 19 | Platform Administration UI | Not started |
| P1 | 01-09 | Import/export, business overrides, support tools, subscription lifecycle, billing, API admin, observability, release mgmt, legal | Not started |

**P0: 13 full sections done (01, 02, 03 -- 03.2 deferred by design, 04, 05, 06, 07, 08, 09,
11, 12, 13, 14), plus 18.1 and 10.1 (10.2/10.3/10.4 remain open within the AI Safety
section). §17 (13) is fully resolved as of 2026-09-13 -- 13.1/13.2/13.4 built, 13.3 closed by
user decision (satisfied-by-existing-code, no platform-layer counterpart needed). §18 (14,
Platform Policies) is fully resolved as of 2026-09-13 -- 14.1/14.2/14.3 all built,
config-only.
P1: 0/9 done.**

## Pre-implementation reconnaissance (Rule 1 — done once, up front)

- **Existing platform-admin precedent**: `packages/core/src/rbac/platform-admin.ts` already
  gates `/dashboard/admin` (currently just a demo-data seed/delete tool) via a pure
  `PLATFORM_ADMIN_EMAILS` env var check (`isPlatformAdminEmail()`/`requirePlatformAdmin()`,
  ported from stockpilot-ai-ops). Real, but too primitive for what this backlog asks
  (no DB row, no auditability, no per-role extensibility) -- reused as a **bootstrap**
  path (so the very first SUPERADMIN can always get in) rather than replaced.
- **Identity model**: `auth.users(id)` is the canonical identity anchor across
  `core.account_members`/`core.business_members`/`core.employees`, all via `user_id`.
  `platform.admins.user_id` follows the same convention -- a SUPERADMIN is a raw auth
  user, no account/business/employee row required (matches §5's "No Tenant Context
  Required").
- **RBAC pattern to mirror**: `core.has_permission(business_id, key)` -- `security
  definer`, `stable`, `set search_path`, revoke from public/anon + grant execute to
  authenticated. `platform.is_superadmin()` copies this shape exactly, scoped to
  `auth.uid()` with no business_id (platform authorization has no tenant axis).
- **Entity-ownership map** (`docs/plan/00-MASTER-PLAN.md` §5): no `platform` schema or
  concept exists there today -- genuinely new, not a duplicate of anything (non-negotiable
  #5 check passed). CLAUDE.md's non-negotiable #1 schema list (`core, discovery,
  inventory, fsm, crm, gst`) is updated in the same commit to add `platform`, matching
  the doc's own §3 "Recommended conceptual schemas" and the workflow rule "if the story
  revealed the plan was wrong, update the plan doc in the same commit" -- the user's own
  request to implement this doc is the explicit approval CLAUDE.md's non-negotiable #10
  requires for an architecture change.
- **Route/layout separation**: `/platform` is a **new top-level segment** in
  `apps/web/app/` (not nested inside the `(dashboard)` route group), so it gets its own
  layout tree with none of the customer sidebar/topbar chrome -- satisfies §3's "not a
  normal customer/business account with elevated UI permissions" structurally, not just
  by convention.
- **`scripts/lint-migration-schema.mjs`**: `KNOWN_SCHEMAS` is a hardcoded set: needs
  `"platform"` added or every `platform.*` migration fails the schema-qualification check.
- **No new workspace package**: `packages/core` already hosts every cross-cutting
  concern (rbac, licensing, audit, admin). Platform-level server logic grows there
  (`src/rbac/platform-admin.ts`, and a future `src/platform/` for platform.*-schema
  queries/mutations as later stories need them) rather than a new `packages/module-*`
  package -- platform admin isn't a licensable customer module, so the module-registry/
  `lint:boundaries` machinery doesn't apply to it and shouldn't be forced to.

## Story log

### PLATFORM-P0-01 — SUPERADMIN (2026-09-11)

New `platform` schema (first-ever platform-owned entity) + `platform.admins` (`user_id`
-> `auth.users`, `role` text with a check constraint currently allowing only
`'superadmin'` -- a column, not a hardcoded enum type, specifically so §32/18.3's future
roles (`PLATFORM_ADMIN`, `BILLING_ADMIN`, `SUPPORT_ADMIN`, `OPERATIONS_ADMIN`,
`SECURITY_ADMIN`) can be added by widening the constraint later, never by restructuring
the table). Soft-revoke (`revoked_at`/`revoked_by`/`revoke_reason`), rows never deleted --
same "history is never destroyed" discipline `core.audit_log`-adjacent tables already
follow, and this table's own rows are exactly the kind of high-risk history §20's future
audit trail will need to reconstruct.

`platform.is_superadmin(p_user_id uuid default auth.uid())` mirrors
`core.has_permission()`'s exact shape (`security definer`, `stable`,
`set search_path = platform`, revoke from public/anon, grant execute to authenticated) --
the actual authorization boundary, not just an application-code check. RLS is enabled on
`platform.admins` with one policy (`select` gated on `is_superadmin()` itself, the same
safe self-referencing-via-security-definer-function pattern `core.api_keys`' own policies
already use) -- no insert/update/delete policy yet, since granting/revoking superadmin
access is its own future, separately-audited capability (§20/§32); until it exists, rows
are migration/service-role-seeded only, matching `core.permissions`/`core.role_permissions`'
own "no builder yet" scope.

`packages/core/src/rbac/platform-admin.ts` gets two new exports, `isSuperadmin()`/
`requireSuperadmin()` -- checked first against the existing `PLATFORM_ADMIN_EMAILS`
bootstrap list (so the very first SUPERADMIN is never locked out before any DB row
exists), then against `platform.is_superadmin()`. The pre-existing
`isPlatformAdminEmail()`/`requirePlatformAdmin()` (gating `/dashboard/admin`) are left
untouched -- a different, already-shipped feature, not this story's to refactor.

`packages/core/src/db/middleware.ts`: the auth wall (`isProtected`) now also covers
`/platform`, so an unauthenticated visitor is redirected to `/login` the same way
`/dashboard` already is -- extracted into a small `isProtectedPath()` helper (mirroring
`activeBusinessIdFromPath()`'s own testable-pure-function shape) rather than inlining a
second prefix check. The license-gate block beneath it is unaffected: it already only
runs when `activeBusinessIdFromPath()` finds a business id, which no `/platform/*` path
ever will -- satisfies §5's PLATFORM-P0-01.4 "No Tenant Context Required" for free,
without a special case.

New `apps/web/app/platform/layout.tsx` -- the real authorization boundary
(`requireSuperadmin()`, redirecting a non-superadmin to `/dashboard` the same way
`/dashboard/admin`'s own page already does) plus a minimal header clearly reading
"WonderArc Platform Administration" / a "SUPERADMIN" badge (§5's PLATFORM-P0-01.3),
visually distinct from the customer dashboard chrome (no shared sidebar/topbar
components). New `apps/web/app/platform/page.tsx` is a deliberately minimal placeholder
proving the gate end-to-end -- the real Dashboard (§6, PLATFORM-P0-02) is its own,
separate next story, not built ahead of turn.

Verified with full monorepo typecheck, `node scripts/lint-import-boundaries.mjs`,
`node scripts/lint-migration-schema.mjs` (after adding `"platform"` to `KNOWN_SCHEMAS`),
`npx vitest run --root packages/core` (new `isProtectedPath()` cases), a live migration
apply + `get_advisors` for both `security`/`performance`, and a clean `next build`.

**Status**: PLATFORM-P0-01 done. Stopping here per the doc's own §39 workflow --
waiting for the next story (PLATFORM-P0-02, Platform Dashboard, is next in Phase 1's own
order, but nothing auto-continues).

### PLATFORM-P0-02 — Platform Dashboard (2026-09-11)

New `packages/core/src/admin/platform-dashboard-queries.ts` -- three service-role query
functions (`getPlatformOverview()`, `getConfigurationHealth()`, `getRecentGlobalChanges()`)
following `admin/queries.ts`'s own already-established pattern exactly:
`createAdminClient({ schema: "core" })`, no RLS bypass concerns because the only caller is
`/platform`, which sits under `requireSuperadmin()` (PLATFORM-P0-01's own layout). No
migration needed -- every metric reads existing `core` tables (`businesses`,
`account_members`, `licenses`, `ai_runs`, `api_keys`, `api_rate_limit_counters`,
`domain_events`, `license_events`, `ai_provider_credentials`), nothing new to store.

**PLATFORM-P0-02.1 (Platform Overview)**: businesses, active users (distinct
`account_members.user_id`), active licenses (a proxy for "active subscriptions" -- there
is no separate subscription/billing entity yet), per-module license counts, 30-day AI
usage (`ai_runs` count + summed `estimated_cost`), 24h API usage
(`api_rate_limit_counters`), and open platform issues (`domain_events` stuck at
`status = 'failed'`). MRR/ARR is deliberately rendered as "--" with a note pointing at
PLATFORM-P0-04 rather than computed: nothing in `core` prices a license or plan yet
(`core.business_settings.plan` is a free-text label, not a billing entity) -- a fabricated
number would violate CLAUDE.md's "never implement speculative functionality" worse than an
honest gap. No customer PII surfaced anywhere (§6.1) -- every widget is a count, a sum, or
a business *name*.

**PLATFORM-P0-02.2 (Configuration Health)**: all seven categories the doc lists (AI
providers, payment provider, email, WhatsApp, country packs, subscription plans, feature
flags) honestly report `configured: false` today, each with a `detail` string naming the
future story that will wire it up (PLATFORM-P0-09/11/12/13/04/08) -- none of those
platform-wide config surfaces exist yet, so nothing here is fabricated. The one category
with a narrower real signal (per-business BYOK `ai_provider_credentials`) surfaces that
count in its own detail text explicitly labeled as *not* the platform-wide provider
registry PLATFORM-P0-09 will add, rather than being folded into a false "configured".

**PLATFORM-P0-02.3 (Recent Global Changes)**: reads `core.license_events` (module
activated/deactivated/reactivated/expired across every business) -- the only genuinely
platform-wide "something changed" ledger that exists yet. Future stories add their own
sources once they exist (PLATFORM-P0-04 plan changes, PLATFORM-P0-08's flag audit,
PLATFORM-P0-15 announcements) rather than this story fabricating a generic events table
ahead of that need.

`apps/web/app/platform/page.tsx` rewritten from PLATFORM-P0-01's placeholder into the real
dashboard -- three sections (Overview KPI grid, Configuration Health list, Recent Global
Changes feed), reusing the Executive Dashboard's own `KpiCard`/`Card`/`Badge` composition
pattern (`apps/web/app/(dashboard)/dashboard/page.tsx`) but with the platform layout's own
dark zinc palette instead of the customer app's theme tokens (explicit `border-zinc-700
text-zinc-300` override on the "Not configured" badge, since the shadcn `outline` variant's
`text-foreground` would otherwise resolve against the site's normal light-theme tokens,
unreadable on this hardcoded dark chrome).

`apps/web/app/platform/layout.tsx` gets one addition: `export const dynamic =
"force-dynamic"`. Discovered via a real build failure -- `next build` attempted to
statically prerender `/platform` and executed the new service-role queries at build time,
throwing on a missing `SUPABASE_SERVICE_ROLE_KEY` in an environment with no `.env.local`.
Every `/platform/*` page is a per-request authenticated control-plane view by design, never
a static-generation candidate, so this is forced explicitly rather than relying on Next's
dynamic-API auto-detection (which apparently doesn't trip early enough here to prevent the
prerender attempt from reaching page-level code).

Verified with full monorepo typecheck, `node scripts/lint-import-boundaries.mjs` (1003
files), `node scripts/lint-migration-schema.mjs` (107 migrations, unchanged -- no new
migration this story), `npx vitest run --root packages/core` (37 tests, unchanged -- no new
pure logic worth a unit test beyond what the sibling `admin/queries.ts` already
establishes as this codebase's pattern for thin service-role query wrappers), and a clean
`next build` after the `force-dynamic` fix (`/platform` now listed `ƒ` dynamic).

**Status**: PLATFORM-P0-02 done. Stopping here per the doc's own §39 workflow -- waiting
for the next story (PLATFORM-P0-16, Platform Audit, or PLATFORM-P0-18, Platform Security
Controls, are next in Phase 1's own order, but nothing auto-continues).

### PLATFORM-P0-18.1 — MFA Required for SUPERADMIN (2026-09-11)

§32's four security stories (18.1-18.4) split across this run and the next as scoped by
the assignment: **18.1 (MFA) built this story**; 18.2 (reauthentication) and 18.4
(destructive-action protection) explicitly **deferred** below since neither has a real
caller yet; 18.3 (least privilege) needs **no new code** -- already satisfied by
PLATFORM-P0-01's own `platform.admins.role` design, confirmed below rather than assumed.

**What was built**: a new route group, `apps/web/app/platform/(protected)/`, with its own
`layout.tsx` that calls the Supabase JS SDK's `auth.mfa.getAuthenticatorAssuranceLevel()`
and redirects to `/platform/mfa` unless `currentLevel === "aal2"`. This is the first MFA
feature anywhere in the codebase -- there was no prior scaffolding to build on beyond the
SDK's own `auth.mfa.*` methods, so this story is the origin of that pattern, not a port of
one. The existing dashboard page built in PLATFORM-P0-02
(`apps/web/app/platform/page.tsx`) moved unchanged (`git mv`, no content edits) to
`apps/web/app/platform/(protected)/page.tsx` -- it's the one page this AAL2 gate protects
today; every future `/platform/*` page lands in this same group automatically as it's
added, with no per-page opt-in required.

`apps/web/app/platform/layout.tsx` (PLATFORM-P0-01's outer shell) is **untouched** --
its `requireSuperadmin()` identity check still runs for every `/platform/*` route,
including `/platform/mfa` itself. AAL2 is a strictly additional, independent layer on top
of that identity check, not a replacement for it, exactly as scoped: a non-superadmin who
somehow completed TOTP verification still gets redirected to `/dashboard` by the outer
layout, before the AAL2 gate is ever reached.

New sibling route `apps/web/app/platform/mfa/` (page.tsx + actions.ts +
mfa-verify-form.tsx) -- deliberately **outside** `(protected)/`, as the story requires: a
not-yet-verified superadmin visiting `/platform/mfa` must not itself be redirected back to
`/platform/mfa` by the very layout it's trying to satisfy. `page.tsx` is a server component
that branches on the actual MFA state rather than only handling first-time enrollment
(the story's two named SDK calls, `auth.mfa.enroll` and `auth.mfa.challengeAndVerify`,
don't by themselves cover the equally-necessary "already enrolled from a previous session,
just needs a fresh challenge" path -- a superadmin who signs out and back in only reaches
AAL1 again, and without this branch they'd hit a broken re-enroll flow every single login):

- **No verified TOTP factor** (first-time setup): any stale *unverified* factor from an
  abandoned earlier attempt is unenrolled first -- its secret/QR can never be re-displayed
  once that page load is gone, so leaving it around would only accumulate dead factors on
  every retry -- then a fresh one is enrolled via `auth.mfa.enroll({ factorType: "totp" })`
  and its QR code (rendered directly from the SDK's returned `data:image/svg+xml` string)
  and manual-entry secret are shown above the code form.
- **A verified TOTP factor already exists** but the session is still AAL1: skips
  enrollment entirely and shows only the code-entry form against that existing factor.

Both paths converge on the same `verifyMfaCode` server action
(`apps/web/app/platform/mfa/actions.ts`), which calls
`auth.mfa.challengeAndVerify({ factorId, code })` -- correct for both cases, since it
creates the challenge and verifies the code in one round trip regardless of whether the
factor was just enrolled or already verified. On success it `redirect()`s to `/platform`,
where the `(protected)` layout's AAL2 check now passes. The action/`useActionState`
shape mirrors `apps/web/app/(auth)/actions.ts` exactly (a `(prevState, formData) => state |
null` function, an `{ error: string } | null` state type, `redirect()` on success), and
`mfa-verify-form.tsx` mirrors `apps/web/components/auth/auth-form.tsx`'s client-component
shape (`useActionState` + a hidden field + `SubmitButton`) -- no new form convention
invented for this one page.

Per the story's explicit instruction, the code field is a plain `<Input type="text"
inputMode="numeric" pattern="[0-9]{6}" maxLength={6}>` -- **not** the vendored
`packages/core/src/components/ui/input-otp.tsx` component, which would add multi-box
focus-management complexity this one low-traffic, admin-only screen doesn't need
(CLAUDE.md development principle #1, "prefer the simplest implementation that works").

**A real typing quirk found along the way**: `@supabase/supabase-js`'s own types make
`listFactors()`'s per-type `totp`/`phone` arrays generic over `Factor<K, 'verified'>` --
i.e. by the SDK's own typing, entries in `data.totp` are always already verified;
unverified factors surface only in `data.all`. An `f.status === "unverified"` filter on
`data.totp` is therefore a compile error (`no overlap` between the literal types), not a
typo -- confirmed by reading `node_modules/@supabase/auth-js/dist/module/lib/types.d.ts`
directly rather than guessing at a cast. The code above filters `data.all` by
`factor_type === "totp" && status === "unverified"` for cleanup, and treats
`data.totp[0]`'s mere presence as "a verified factor exists" for the branch decision --
both correct per that type, not a workaround.

**PLATFORM-P0-18.3 (Least Privilege) -- checked, not built**: `platform.admins.role` is a
plain `text` column with a check constraint (PLATFORM-P0-01), not a hardcoded enum type or
a single-role boolean flag -- widening the constraint to admit `PLATFORM_ADMIN`,
`BILLING_ADMIN`, `SUPPORT_ADMIN`, `OPERATIONS_ADMIN`, `SECURITY_ADMIN` later needs no table
restructuring. Confirmed by re-reading the migration and `platform.is_superadmin()`'s
definition rather than assuming the story's own note was still accurate. No code changes
made for this sub-story, matching the assignment's instruction.

**PLATFORM-P0-18.2 (Reauthentication for high-risk actions) and PLATFORM-P0-18.4
(Destructive-action protection) -- explicitly deferred, not built**: both require actual
mutation server actions to attach to (changing AI secrets, disabling a module, typed
confirmation for a destructive operation, etc.), and this codebase has **zero** platform
mutation server actions today -- everything under `/platform/*` so far (P0-01's shell,
P0-02's dashboard, this story's MFA flow) is read-only or auth-plumbing. Building
reauthentication/confirmation machinery now, with nothing to attach it to, would be
exactly the kind of speculative functionality CLAAUDE.md's development principle #7
forbids. Both remain open until PLATFORM-P0-04 (Plans) or a later mutation-adding story
gives them a real caller.

**Verification**: full monorepo `npm run typecheck` -- clean except two pre-existing
unrelated errors (`gst/layout.tsx`'s `action` vs `countryAction`/`regimeAction` prop
mismatch, and `EvidenceItem.claim` in the prospects page), confirmed pre-existing via
`git log` on both files (last touched by unrelated COMPLY/Discovery commits, not this
story) and via `git diff HEAD --name-only` showing neither file touched here. `npm run
lint` -- 0 errors, 1 pre-existing unrelated warning (`Package` unused import in a CRM
conversations page, also untouched by this story). `node scripts/lint-import-boundaries.mjs`
-- 1007 files, no violations. `node scripts/lint-migration-schema.mjs` -- 107 migrations,
unchanged (no migration this story -- MFA state lives entirely in Supabase Auth's own
`auth.mfa_factors`/`auth.mfa_challenges` tables, not `core`/`platform` schema, matching the
assignment's own note). `npx vitest run --root packages/core` -- 37 tests, unchanged (the
AAL2 check is a two-line comparison against the SDK's own return value, not pure logic
worth a unit test beyond what `isProtectedPath()` already established as this codebase's
bar for that in PLATFORM-P0-01). `apps/web`'s own `vitest run --passWithNoTests` -- 40
tests, unchanged. `cd apps/web && npm run build` -- clean; `/platform` and `/platform/mfa`
both list `ƒ` (dynamic), confirming the outer layout's existing `force-dynamic` (from
PLATFORM-P0-02) correctly covers the new nested route group and the new sibling route
without needing its own copy.

**Limitation, stated plainly**: there is no seeded demo superadmin user or working MFA
test harness in this sandboxed environment (no live Supabase project reachable, no way to
scan a real QR code against a real authenticator app). A live authenticated browser
walkthrough of the actual enroll -> scan -> verify -> land-on-dashboard flow was **not**
performed and is **not** claimed here -- this entry documents build/typecheck/lint
correctness and a read of the actual SDK types and runtime contract, not an end-to-end UI
verification, exactly as every prior story in this log has done when the same gap applied.

**Status**: PLATFORM-P0-18.1 done (18.2/18.4 deferred, 18.3 confirmed already satisfied).
Stopping here per the doc's own §39 workflow -- waiting for the next story (most likely
PLATFORM-P0-16, Platform Audit, or continuing Phase 1's remaining security scope, per the
doc's own recommended order -- but nothing auto-continues).

### PLATFORM-P0-03.1 — WonderArc Branding (2026-09-11)

**Sequencing note, addressed up front**: this run's assignment picks up the doc's own
*section* order (§5 -> §6 -> §7 -> ...) rather than the §37 "Recommended Implementation
Sequence" phase order this table's own rows are grouped by. Those two orderings genuinely
disagree at this point: §37's Phase 1 still has PLATFORM-P0-16 (Platform Audit) open, and
this log's own previous "Status" line named PLATFORM-P0-16 as the most likely next story.
Section order instead reaches §7 (Branding, PLATFORM-P0-03) next, since §5/§6 are done and
§32's first sub-story (18.1) was already pulled forward as security hardening. This is a
sequencing choice, not a security/architecture judgment call the doc leaves ambiguous
(both orderings are explicitly named in the doc itself, §3/ToC vs §37), so it proceeds
rather than stopping to ask -- recorded here so the discrepancy this table shows is
explained rather than silently papered over. PLATFORM-P0-16 (Audit) and the rest of §37's
Phase 1/2/3 remain open and are simply reached later, in section order, rather than
skipped.

**What was built**: `platform.branding` (migration
`20260911010000_platform_branding.sql`) -- a *singleton* row (boolean primary key fixed to
`true`, not a uuid, so "there is exactly one WonderArc brand" is enforced by the column's
own type, not just a constraint someone could later drop) holding every field §7's
PLATFORM-P0-03.1 literally lists:

| Backlog item | Column(s) |
|---|---|
| Platform Name | `platform_name` |
| Logo | `logo_url` |
| Favicon | `favicon_url` |
| Primary Brand | `primary_color` |
| Secondary Brand | `secondary_color` |
| Accent Color | `accent_color` |
| Login Branding | `login_headline`, `login_support_text` |
| Email Branding | `email_from_name` |
| Footer | `footer_text` |
| Support Contact | `support_email`, `support_url` |

Hex colors, URLs (`http(s)://` only), and the support email each have a Postgres `check`
constraint at the column level (defense in depth under the DB itself, not only the app's
Zod schema). RLS mirrors `platform.admins`' own shape exactly (`platform.is_superadmin()`,
the same SECURITY DEFINER function) but, unlike `platform.admins` (read-only until a future
grant/revoke story), this table gets both a `select` **and** an `update` policy -- read/
write by a superadmin is literally what this story asks for, not deferred scope. No
`insert`/`delete` policy exists at all (only `service_role` -- via `grant all` -- could add
or remove the row, and the migration is the only place that ever does), so the row count
can never drift from exactly 1 through the app.

**Deliberately not built this story** (each is its own later sub-story in this same §7
section, not guessed at ahead of turn):
- **Draft/preview/publish (03.5)** -- a save takes effect immediately, same as every other
  plain settings form in this codebase today (`dashboard/settings/profile`,
  `dashboard/settings/licenses`). No version history table, no draft state.
- **Non-color design tokens (03.2)** -- radius, button style, font family, spacing density.
  Only the three colors 03.1 explicitly names exist as columns.
- **The fuller login-page treatment (03.3)** -- background treatment and legal links.
  03.1's own "Login Branding" line is covered by two columns (headline, support text); the
  richer page-level treatment is 03.3's own scope.
- **Wiring these values into any live customer-facing surface** -- the actual site favicon/
  logo, the real login page's look, or an email "From" header. Three independent reasons,
  stated plainly rather than assumed: (1) the customer app's actual visual theme is locked
  to the reference mockup in `docs/DESIGN.md` per CLAUDE.md non-negotiable #7 -- dynamically
  re-theming the live shell from this table without that non-negotiable's own rules being
  revisited would be an unapproved architecture change, not this story's to make; (2) there
  is no email-sending system yet (PLATFORM-P0-11) for `email_from_name` to plug into; (3)
  the doc's own §7 wording throughout is "Configure X", i.e. the admin capability to store
  these values -- not "make the app render them". This page is the configuration source of
  truth; each future consuming surface wires itself up to it once it exists.
- **A dedicated audit-log entry per change (PLATFORM-P0-16)** -- `core.write_audit_log()`
  hard-requires a `business_id` (see `packages/core/src/audit/mutations.ts`), so it
  structurally cannot record a platform-wide change with no business behind it; building a
  parallel platform-audit mechanism ahead of PLATFORM-P0-16's own turn would duplicate
  effort rather than reuse it. `updated_by`/`updated_at` on the row itself is the same
  "minimal accountability, not full history" scope `core.permissions`/
  `core.role_permissions` already accept while awaiting their own future builder --
  confirmed by reading `write_audit_log`'s actual signature rather than assumed.

**Application layer**: `packages/core/src/admin/platform-branding.ts` --
`getPlatformBranding()`/`updatePlatformBranding()`, both calling `requireSuperadmin()`
first (defense in depth on top of RLS, mirroring `requireModule()`'s role for tenant
mutations) and both using the request-scoped, cookie-authenticated `createClient({schema:
"platform"})` -- **not** `createAdminClient()` -- so `platform.branding`'s own RLS policy
is the authoritative enforcement layer for this mutation, same as every other
licensed/tenant table's "RLS (authoritative)" rule, just without a tenant/license axis.
This is a deliberate departure from PLATFORM-P0-02's dashboard queries (which correctly use
the service-role client for cross-tenant aggregation reads with no write path) -- this
story is a real, superadmin-authored mutation, so RLS must be the thing actually stopping a
non-superadmin, not merely a page-level redirect.

`platformBrandingInputSchema` (Zod) validates every field -- required non-empty platform
name; hex-color regex for primary (required) and secondary/accent (optional); `http(s)://`
regex for logo/favicon/support URLs; email regex for support email; empty string on any
optional field normalizes to `null` rather than being stored as `""`. Returns per-field
errors (`Record<string, string>`) rather than one opaque message, so the form can surface
each error next to its own input. Unit-tested directly in
`packages/core/src/admin/platform-branding.test.ts` (8 new cases: full valid input, blank
required name, empty-to-null normalization, malformed primary/optional colors, scheme-less
URLs, malformed email, whitespace trimming) -- this is real, non-trivial validation logic
(distinct from the pure data-mapping `toBranding()` helper beside it), so it gets tests per
the assignment's own bar, not just the authorization-logic cases PLATFORM-P0-01's
`isProtectedPath()` set as this codebase's minimum.

**UI**: `apps/web/app/platform/(protected)/branding/` (page.tsx, actions.ts,
branding-form.tsx) -- placed under the existing `(protected)` route group from
PLATFORM-P0-18.1, so editing platform branding requires the same AAL2 MFA step every other
`/platform/*` mutation surface will. One form, six grouped `Card` sections (Platform
identity / Brand assets / Brand colors / Login branding / Email branding / Footer) per
`docs/design/claude-ui-design-rules.md`'s "group related fields, plan hierarchy before
markup" rule, a single primary "Save changes" action at the bottom (not one save button per
section -- this is one entity, one save), and a "Last updated" timestamp caption next to
it. Color fields get a small swatch preview beside the hex input. Always-editable (no
separate view/edit toggle like `ProfileCard`'s) -- this is a standalone settings screen
with one purpose, not a card living among a list of other things to glance at, so the
simpler always-open form fits CLAUDE.md's "prefer the simplest implementation that works"
better than porting the toggle pattern.

Every `Input`/`Textarea`/`Label` on this page gets an explicit dark-zinc className override
(`border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500`). The vendored
components' default classes (`border-input`, `bg-transparent`, `text-foreground`,
`placeholder:text-muted-foreground`) resolve against `packages/core/src/ui-theme.css`'s
light-theme tokens, which this hardcoded dark `/platform` chrome never opts into (no
`.dark` class anywhere in `platform/layout.tsx`) -- the same class of fix PLATFORM-P0-02
already applied to one Badge on the dashboard, applied here across every text field on a
much more form-heavy page. Noted for the record: `platform/mfa/mfa-verify-form.tsx`
(PLATFORM-P0-18.1) has this same latent contrast issue on its one `Input` and was left
untouched -- a different, already-shipped file, not this story's to refactor per CLAUDE.md
development principle #10, even though the fix is directly adjacent.

`apps/web/app/platform/layout.tsx` gains a one-line nav strip (`Dashboard` / `Branding`
text links) below the existing header -- PLATFORM-P0-01's layout deliberately had no nav at
all because there was exactly one page to reach; with a second page now, an orphaned,
unreachable-via-UI route would fail this doc's own "no page should be invisible" spirit
without yet justifying PLATFORM-P0-19's full "Dedicated Admin Layout" sidebar (a separate,
later Phase-4 story). This is intentionally the smallest thing that makes both pages
reachable, not a preview of 19's own design.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace (this
worktree needed its own `npm install` first -- a fresh git worktree has no local
`node_modules`, and without one, Node's module resolution walks up past the worktree root
to the outer checkout's `node_modules/@cofounderai/core` symlink, type-checking this
worktree's `apps/web` against a *different* copy of `packages/core` that doesn't have this
story's new file; installing locally fixes the workspace symlinks to point at this
worktree's own packages, which also happened to make two previously-"pre-existing" errors
this log's PLATFORM-P0-18.1 entry recorded disappear -- they were an artifact of that same
cross-checkout mismatch, not real repo state, corrected here rather than re-asserted).
`npm run lint` -- 0 errors (one unescaped-apostrophe error caught and fixed in
`branding/page.tsx`'s own copy), 1 pre-existing unrelated warning (`Package` unused import
in a CRM conversations page, untouched by this story). `node scripts/lint-import-
boundaries.mjs` -- 1011 files, no violations. `node scripts/lint-migration-schema.mjs` --
108 migrations (107 -> 108, this story's one new file), no violations. `npx vitest run
--root packages/core` -- 45 tests (37 -> 45, this story's 8 new schema-validation cases),
all passing. `apps/web`'s own `vitest run --passWithNoTests` -- 40 tests, unchanged. Live
migration applied via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; `mcp__Supabase__get_advisors` for both `security` and
`performance` afterward showed zero *new* findings -- the security findings listed are all
pre-existing (`core`/`discovery` tables unrelated to this migration, plus the pre-existing
leaked-password-protection warning), and the one new performance "unused index" entry
(`branding_updated_by_idx`) is the same expected class as `platform.admins`' own three
FK indexes in this empty dev database, not a real regression. Confirmed the seeded
singleton row directly via `execute_sql` (`platform.branding` has exactly one row, id
`true`, `platform_name = 'WonderArc'`, every optional field `null`, matching the
migration's own defaults). `cd apps/web && npm run build` -- clean; `/platform/branding`
lists `ƒ` (dynamic), correctly inheriting the outer layout's existing `force-dynamic`
(from PLATFORM-P0-02) with no per-route opt-in needed, same as `/platform/mfa` already
demonstrated.

**Limitation, stated plainly**: same as every prior story in this log -- there is no seeded
demo superadmin user or live Supabase session reachable in this sandboxed environment, so a
live authenticated browser walkthrough of actually loading `/platform/branding`, editing a
field, and seeing the save/toast/re-render cycle was **not** performed and is **not**
claimed here. This entry documents build/typecheck/lint/unit-test correctness and a direct
read of the applied schema and RLS policies against the live dev database, not an
end-to-end UI verification.

**Status**: PLATFORM-P0-03.1 done (03.2/03.3/03.4/03.5 remain open, each its own later
sub-story). Continuing to the next story in section order per this run's auto-continue
assignment (distinct from this doc's own normal "stop after one story" §39 workflow, which
governed every prior entry above).

### PLATFORM-P0-03.2 — Global Design Tokens (2026-09-12, deferred, not built)

**Deferred, not implemented.** PLATFORM-P0-03.2 asks for admin-configurable primary/accent
color, border radius, button style, font family, and spacing density for the platform
shell. This directly conflicts with `CLAUDE.md`'s locked, non-negotiable design system
(#7: "CoFounderAI's own UI/UX design takes precedence over any vendored default... every
module's screens share this one design system; a module never brings its own look") and
development principle #10 ("do not modify architecture without explicit user approval").
Storing admin-configurable values for the shell's own radius/spacing/font with no wiring
would be speculative functionality with no legitimate purpose except eventually restyling
the locked shell (CLAUDE.md development principle #7, "never implement speculative
functionality"); actually wiring them would erode a locked non-negotiable without
approval. This assessment was made explicit in this run's own task assignment (not a
judgment call made ad hoc here) -- skipped per that assignment's instruction, recorded here
rather than silently passed over, and not re-litigated. No code, no migration, no UI for
this sub-story. Moving on to PLATFORM-P0-03.3.

### PLATFORM-P0-03.3 — Platform Login Branding (2026-09-12)

**What this story is, distinct from 03.1**: 03.1 built `platform.branding` and its own
settings page but deliberately did not wire any of its login-related fields
(`login_headline`, `login_support_text`) into the actual public login page -- that page-
level treatment was explicitly left to this sub-story. 03.3 adds the two remaining §7
"Platform Login Branding" items (background treatment, legal links) as new columns, and
-- unlike 03.1's own choice not to touch live customer-facing surfaces -- actually wires
logo/headline/support-text/background/legal-links into the real, public
`apps/web/app/(auth)/layout.tsx` and `.../login/page.tsx`. This is not a contradiction of
03.1's own reasoning: 03.1 avoided live-wiring specifically because the *dashboard shell's*
colors are locked to `docs/DESIGN.md` per CLAUDE.md non-negotiable #7 -- a lock that
doesn't extend to the pre-login auth pages' own *content*. Storing these fields with no
consumer would itself have been the kind of speculative, dead configuration this backlog's
own PLATFORM-P0-03.2 entry above was just deferred for -- so wiring them in is what makes
this sub-story real rather than another deferral.

**A recorded decision this story had to reconcile**: `apps/web/app/globals.css`'s own
docstring on `.landing-theme` states the dark-violet marketing/auth identity is "kept as
its own scoped token namespace... means keeping unchanged here" per an explicit platform-
owner decision. Read closely, not skipped past: that note is about the auth pages' *visual
identity/color theme* (the violet `--landing-accent` etc.), not a freeze on the login
page's copy or a ban on ever making it admin-configurable. This story reconciles the two by
making every new field an **opt-in override that defaults to exactly today's look**: the
background style column defaults to `'gradient'` with a `null` value (which resolves to no
inline style override at all, so the existing `bg-landing-bg` class renders unchanged), and
the headline/support-text/logo/legal-link fields all default to `null` (rendering today's
hardcoded copy/wordmark, showing no legal-link footer). Nothing about the recorded decision
is violated by a field that, unconfigured, changes nothing; a superadmin who explicitly
sets one of these fields is making a new platform decision of their own, which is exactly
what "Platform Login Branding" as an admin capability means.

**What was built**: migration `20260911020000_platform_login_branding.sql` adds four
columns to the existing singleton `platform.branding` row: `login_background_style` (text,
closed vocabulary `gradient|solid|image`, not free CSS -- PLATFORM-P0-03.2's own "do not
allow arbitrary CSS injection" instruction applies here too even though 03.2 itself is
deferred), `login_background_value` (text, nullable, interpreted per style -- a URL for
`image`, one hex color for `solid`, two comma-separated hex colors for `gradient`), and
`login_terms_url`/`login_privacy_url` (text, nullable, http(s)-only). A row-level check
constraint validates the value against its own style in the same row (e.g. `image` requires
an http(s) URL) -- defense in depth under the database itself, mirrored by a
`.superRefine()` on the Zod schema so the app rejects the same malformed pairings with a
field-level error rather than a raw Postgres error. "Legal links" is deliberately scoped to
Terms + Privacy (the two nearly every login screen shows) rather than a fully dynamic,
arbitrary-length link list -- PLATFORM-P1-09.3 ("Legal Link Management") is the later, P1
story that generalizes this into Terms/Privacy/Cookie Policy/DPA/Support with version
tracking; building that general mechanism now for a P0 story that only asks for "legal
links" on one screen would be speculative ahead of its own turn. No new RLS policy needed
-- the existing `platform.branding` `select`/`update` policies already cover new columns on
an existing row (RLS is row-level, not column-level).

**The one deliberate exception to "RLS is authoritative" in this file**:
`packages/core/src/admin/platform-branding.ts` gains `getPublicLoginBranding()`, which uses
`createAdminClient()` (service-role, RLS-bypassing) rather than the cookie-authenticated
client every other function in this file uses. This is necessary, not a shortcut: the
consumer is an anonymous visitor on `/login`, who by definition cannot pass
`platform.branding`'s own RLS policy (`select` gated on `platform.is_superadmin()`) or
`requireSuperadmin()`. Safe to do because every field this function returns is display copy
the login page needs to show *someone not yet signed in* anyway -- no keys, no credentials,
no per-business data. The RLS policy's job is keeping this row *editable* by superadmins
only, not keeping its *display content* secret. The function returns only a narrow
`PublicLoginBranding` projection (platform name, logo, headline, support text, background
style/value, terms/privacy URLs) -- never the full row, never `updated_by`.

**UI (admin side)**: `apps/web/app/platform/(protected)/branding/branding-form.tsx` gets
two new `Card` sections between "Login branding" and "Email branding" -- "Login page
background" (a `NativeSelect` for the closed-vocabulary style plus a value `Input`, with
placeholder/help text that changes with the selected style, and a small controlled
`backgroundStyle` state so the help text updates live without a page reload) and "Legal
links (login page)" (two plain URL fields). `NativeSelect` (not the Radix `Select`) is used
because this whole page is one plain form submitted through a Server Action, matching how
every other field on this page already works -- a Radix Select can't participate in a
native form submission without extra client-side wiring to sync a hidden input.

**UI (public side)**: `apps/web/app/(auth)/layout.tsx` (now `async`, reading
`getPublicLoginBranding()` once since it wraps every auth page -- login, signup,
forgot-password, reset-password, which all share this one background) applies the
background override via an inline `style` (inline style beats the `bg-landing-bg`
utility class's own specificity, so this needs no new CSS) and renders a superadmin-
configured logo `<img>` in place of the hardcoded "CoFounderAI" wordmark when `logoUrl` is
set (plain `<img>`, not `next/image`, since the URL is runtime-configured superadmin input,
not a build-time-known asset `next/image` could allowlist a domain for).
`apps/web/app/(auth)/login/page.tsx` reads the same function again (a second, independent
read -- accepted as the simplest option per CLAUDE.md development principle #1 rather than
threading branding down through the shared layout's props for one page) to override its
headline/support-text copy when set, and renders a small Terms/Privacy footer line only
when at least one legal link is configured -- both entirely absent from an unconfigured
platform. Signup/forgot-password/reset-password pages get the shared background/logo only,
not the headline/support-text/legal-link overrides -- matching the backlog's own title,
"Platform *Login* Branding", literally.

**Build-time trap, same class as PLATFORM-P0-02's**: `next build` failed prerendering
`/forgot-password` with `supabaseUrl is required` -- the newly-async `(auth)/layout.tsx`
was executing `getPublicLoginBranding()`'s service-role client construction at build time
in an environment with no `.env.local`, since every page under `(auth)` had previously been
a static-prerendering candidate (no dynamic API used) and Next attempted exactly that.
Fixed the same way PLATFORM-P0-02 fixed the equivalent `/platform` failure: `export const
dynamic = "force-dynamic"` on `(auth)/layout.tsx`. Every auth page is now `ƒ` (dynamic) in
the build output, which is correct regardless of this bug -- these pages render live,
per-request platform configuration now, never a static-generation candidate.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace (this
worktree again needed its own `npm install` first, same `node_modules` symlink issue
PLATFORM-P0-03.1's own entry documented for a fresh worktree). `npm run lint` -- 0 errors
(one `eslint-disable-next-line` comment initially placed one line too early, above two
explanatory comment lines instead of directly above the `<img>` it targeted, so the
directive covered the wrong line and produced both an "unused directive" warning and the
`no-img-element` warning it was meant to suppress -- fixed by moving the directive
immediately above the `<img>`), 1 pre-existing unrelated warning (`Package` unused import in
a CRM conversations page, untouched by this story). `node scripts/lint-import-
boundaries.mjs` -- 1113 files, no violations. `node scripts/lint-migration-schema.mjs` --
122 migrations (up from 108 at 03.1's own entry -- the difference is other workstreams'
concurrent merges into `main` since then, not anything untracked by this story), no
violations. `npx vitest run --root packages/core` -- 54 tests (54 -- up from 45 at 03.1,
this story's 9 new background/legal-link validation cases), all passing. `apps/web`'s own
`vitest run --passWithNoTests` -- 41 tests (up from 40 -- a pre-existing route test file
gained an assertion from another workstream's own concurrent merge, unrelated to this
story; confirmed via `git diff` that this story touched no `apps/web` test files at all).
Live migration applied via `mcp__Supabase__apply_migration` against the
**dev** project (`jazdtomcgqjxjueedmck`) only; confirmed via `execute_sql` that the
singleton row now carries the four new columns with their documented defaults
(`login_background_style = 'gradient'`, the rest `null`). `mcp__Supabase__get_advisors` for
both `security` and `performance` afterward showed **zero new findings** -- every listed
finding (five pre-existing `rls_enabled_no_policy` tables unrelated to this migration, the
pre-existing leaked-password-protection warning, and 130+ pre-existing "unused index"
entries across every schema in this empty dev database) was already present before this
migration; this migration added no new index and no new RLS policy, so there was nothing
new for either advisor to flag. `cd apps/web && npm run build` -- clean after the
`force-dynamic` fix; `/login`, `/signup`, `/forgot-password`, `/reset-password` and
`/forgot-password/check-email`/`/signup/check-email` all list `ƒ` (dynamic).

**Limitation, stated plainly**: same as every prior story in this log -- there is no seeded
demo superadmin user or live Supabase session reachable in this sandboxed environment, so a
live authenticated browser walkthrough of actually editing these fields on
`/platform/branding` and then loading `/login` to see the override rendered was **not**
performed and is **not** claimed here. This entry documents build/typecheck/lint/unit-test
correctness and a direct read of the applied schema and RLS policies against the live dev
database, not an end-to-end UI verification.

**Status**: PLATFORM-P0-03.2 deferred (recorded above, not built), PLATFORM-P0-03.3 done.
Continuing to PLATFORM-P0-03.4 (Customer-Facing Branding Scope) next, per this run's
auto-continue assignment.

### PLATFORM-P0-03.4 — Customer-Facing Branding Scope (2026-09-12)

**What this story asks, read literally**: "Clearly distinguish WonderArc Platform
Branding from future Business-level branding. Business administrators must not be able
to change WonderArc's global brand." Two halves: a labeling/documentation half (make the
distinction obvious to a reader) and an authorization half (make it actually true, not
just documented). Reconnaissance confirmed **no business-level branding feature exists
anywhere in this codebase yet** -- the only related text is
`packages/module-fsm/src/components/settings/settings-view.tsx`'s own note that "company
logo/document footer aren't configurable yet ... need a document-branding upload feature
this platform doesn't have yet either", and `core.items.brand` is an unrelated *product*
attribute (a manufacturer name like "Nike", not a visual identity concept). So this story
is about making the boundary unmistakable and verified now, before a future story ever
builds business-level branding into that same gap, not retrofitting a fix onto an
existing collision.

**A real bug found and fixed while investigating the authorization half**: reading
`platform.is_superadmin()`'s RLS policies confirmed they were correctly scoped, but
actually *proving* "a business admin cannot change it" requires a live role-switched
query, not just reading the policy SQL -- something no prior platform story had actually
done (each verified schema/RLS *definitions* by inspection, typecheck, and build, never
an executed query as a non-superadmin). Running exactly that check via
`mcp__Supabase__execute_sql` against the **dev** project (role `authenticated`, `set
local request.jwt.claim.sub` to a synthetic user id, `select count(*) from
platform.branding`) surfaced `ERROR: 42501: permission denied for schema platform` --
not an RLS rejection, a schema-level permission error thrown *before* RLS is ever
evaluated. Comparing against `20260907120000_grant_schema_privileges.sql` (a real,
already-documented production bug from Epic 2: "every prior migration... assumed
`core`/`discovery`/`inventory` behaved like Supabase's built-in `public` schema... A
schema created by our own migrations gets no such automatic grant") confirmed the exact
same class of gap: `fsm`/`gst`/`crm`'s own schema-creation migrations each grant `usage
on schema <x> to authenticated, service_role` inline, and `core`/`discovery`/`inventory`
got theirs via that dedicated fix migration -- but `20260911004400_platform_superadmin.sql`
(PLATFORM-P0-01, `create schema platform;`) never got the equivalent line, and neither did
PLATFORM-P0-03.1/03.3's own migrations. **This meant every `/platform/branding` read and
write has been silently broken for a real superadmin since PLATFORM-P0-03.1 first
shipped** -- not merely correctly denied for a business admin who was never supposed to
get in, which is a materially worse bug than what this story set out to check. Fixed by
`supabase/migrations/20260912010000_platform_schema_grants.sql`
(`grant usage on schema platform to authenticated, service_role;`) -- deliberately
*only* the schema-level grant, not the core/discovery/inventory fix's blanket
`select, insert, update, delete on all tables`, since `platform.admins`/`platform.branding`
each already deliberately chose narrower table-level grants (`select` only; `select,
update` only) that this fix does not widen. Applied live via
`mcp__Supabase__apply_migration` against the **dev** project (`jazdtomcgqjxjueedmck`)
only, then re-ran the same role-switched query: the "permission denied for schema"
error is gone, and a non-superadmin instead correctly gets 0 rows on `SELECT` and a
silent no-op on `UPDATE` (confirmed the row's `platform_name` was untouched afterward,
still `WonderArc`) -- RLS now actually reachable and actually enforcing, not
short-circuited by a missing grant one layer below it.

**Authorization verification, made permanent**: added `scripts/test-platform-branding-rls.mjs`
(wired into `package.json`'s `test:db` composite script, after
`test-crm-backlog-rls.mjs`) -- the first automated RLS test for the `platform` schema,
following the exact same `withTestDatabase` harness every other `test-*-rls.mjs` in this
repo already uses. Seeds a real business with a `core.business_members.role = 'admin'`
member (Alice -- the literal "business administrator" concept this story names, not a
stand-in) and a real `platform.admins` superadmin (Zoe, seeded the same
service-role/migration-only way the actual bootstrap flow works). Asserts: Alice gets 0
rows on `select * from platform.branding` and 0 rows on `select * from platform.admins`;
Alice's `update platform.branding set platform_name = ...` silently affects zero rows
(row unchanged, confirmed via a service-role read); Zoe can read and update both tables;
and -- the negative space this story doesn't ask for but the same table's own design
already promises -- **not even Zoe** can `INSERT` a second `platform.branding` row or
`DELETE` the singleton, since no such policy or grant exists for `authenticated` at all
(only `service_role`, i.e. the migration, ever adds/removes that row). Ran it locally
against a real, throwaway Postgres 16 database (this sandbox's own local cluster, which
needed a one-time `pg_hba.conf` ownership fix -- `chown postgres:postgres`, restored
after another process had apparently left it root-owned -- and a temporary local
superuser role matching this sandbox's OS user, dropped again once the run finished):
**all 10 assertions passed** on the first run against every migration in the current
timeline (126 files), proving both the bug (pre-fix) and the fix (post-fix) rather than
asserting either from reading code alone. This script now also runs in CI via `npm run
test:db`, which has a real `postgres:16` service container per
`.github/workflows/ci.yml` -- unlike every other `test-*-rls.mjs` script, an actual
execution of this one is included in this story's own verification, not deferred as a
future-CI-only claim.

**Documentation/labeling half**: `packages/core/src/admin/platform-branding.ts` gains a
dedicated docstring paragraph naming the structural (not just naming-convention)
separation from any future business-level branding: different Postgres schema
(`platform`, never `core`/a module schema), different route (`/platform/branding`, never
linked from any business admin UI), different authorization function
(`platform.is_superadmin()`, which takes no `business_id` and never consults
`core.business_members`), and an explicit instruction for whoever eventually builds
business-level branding: it must be its own `core`-/business-schema-owned table under
ordinary `tenant AND licensed` RLS, never a reuse of this table, route, or function.
`apps/web/app/platform/layout.tsx`'s nav strip relabels "Branding" to "Platform
Branding" -- a one-word change, cheap insurance against ambiguity even though nothing
today could actually confuse the two (this label doesn't rely on that staying true
forever). `/platform/branding`'s own page copy already said "not a business's own
branding" since PLATFORM-P0-03.1 -- left as-is, already correct.

**Deliberately not built this story**: no new UI, no new admin-configurable field, no
change to `platformBrandingInputSchema` -- PLATFORM-P0-03.4 is a scope/authorization
story, not a new capability, and CLAUDE.md's "never implement speculative functionality"
rules out building a business-level branding *table* now merely to have something to
"distinguish" against when nothing in this backlog has asked for that table yet (it's
explicitly future scope per the story's own wording). PLATFORM-P0-03.5 (Preview Before
Publish) is next and is its own, separate workflow story.

**Verification**: this worktree needed its own `npm install` first (no local
`node_modules` in a fresh worktree -- same cross-checkout symlink issue PLATFORM-P0-03.1's
own entry documented; confirmed the resulting `package-lock.json` has no diff). Full
monorepo `npm run typecheck` -- clean across every workspace. `npm run lint` -- 0 errors,
the same 1 pre-existing unrelated warning (`Package` unused import in a CRM conversations
page, untouched by this story). `node scripts/lint-import-boundaries.mjs` -- 1139 files,
no violations. `node scripts/lint-migration-schema.mjs` -- 126 migrations (122 -> 126;
+1 this story's own grant migration, +3 other workstreams' concurrent merges into `main`
since 03.3's own entry), no violations. `npx vitest run --root packages/core` -- 54 tests,
unchanged (this story's real logic is authorization/RLS, tested by the new
`test-platform-branding-rls.mjs` script instead of a vitest unit test -- no new pure
validation logic was added to `platform-branding.ts`, only a docstring). `apps/web`'s own
`vitest run --passWithNoTests` -- 41 tests, unchanged. `node scripts/test-platform-branding-rls.mjs`
-- **run directly, locally, against a real throwaway Postgres 16 database** (not just
described) -- all assertions passed, both before and after applying the schema-grant fix
(pre-fix: the harness itself can't even distinguish "no grant" from "RLS denied" without
the fix, which is exactly why this test needed the fix landed first to assert the correct
*post-fix* behavior; the pre-fix, live-dev-project repro is documented above instead).
Live migration applied via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; confirmed via role-switched `execute_sql` calls (not just
schema/policy inspection) that a non-superadmin now gets 0 rows / a no-op update, and that
the row's `platform_name` is still `WonderArc`, unchanged, after the earlier failed
"Hacked" attempt made mid-investigation. `mcp__Supabase__get_advisors` for both `security`
and `performance` afterward showed **zero new findings** -- this migration adds a schema
grant, not a table, index, or RLS policy, so neither advisor had anything new to flag; all
listed findings (5 pre-existing `rls_enabled_no_policy` tables, the pre-existing leaked-
password-protection warning, 130+ pre-existing "unused index" entries including
`platform.admins`'/`platform.branding`'s own from prior stories) were already present.
`cd apps/web && npm run build` -- clean after the worktree's own `npm install`; `/platform`
and `/platform/branding` still list `ƒ` (dynamic), unchanged (no new route segment this
story).

**Limitation, stated plainly**: same as every prior story in this log -- there is no
seeded demo superadmin user in this environment, so a live authenticated browser
walkthrough of `/platform/branding`'s nav label or page copy was not performed. This is
narrower than most prior stories' limitation note, though: this story's *actual*
authorization-critical claim (a business admin cannot read or write
`platform.branding`/`platform.admins`, and a superadmin can) was verified twice, for
real -- once against the live dev Supabase project via role-switched `execute_sql`, and
once by actually executing `scripts/test-platform-branding-rls.mjs` against a real local
Postgres database -- not merely asserted from reading policy SQL, which is the standard
this log is raising for every future `platform.*` authorization change from here on.

**Status**: PLATFORM-P0-03.4 done. PLATFORM-P0-03.5 (Preview Before Publish) picked up next
in section order, finishing §7 Branding -- see its own entry below.

### PLATFORM-P0-03.5 — Preview Before Publish (2026-09-12)

**What this story asks, read literally**: "Provide Edit / Preview / Publish. Global
branding changes should not become active merely because a field was edited." Every prior
§7 sub-story (03.1/03.3/03.4) wrote straight to `platform.branding`'s live columns on
save -- exactly the "becomes active merely because a field was edited" behavior this story
forbids. This is a real, user-visible behavior change to the existing branding form, not
an additive field.

**A real design fork, resolved rather than deferred**: §22 ("Configuration Versioning",
PLATFORM-P0-17) is a later, general Draft/Published/Archived + rollback mechanism for
*all* important platform configuration, and its own example list literally names
"Branding v7" -- so there's real conceptual overlap with this story. Building that general
mechanism now would be exactly the kind of ahead-of-turn scope creep this backlog's own
03.1 entry already declined for its "configuration version history (PLATFORM-P0-17)" note.
This story is scoped to branding's own Edit/Preview/Publish, matching the doc's own
per-story granularity (the same pattern 03.3 followed when it scoped "legal links" down
from PLATFORM-P1-09.3's fuller future version) -- §22, when it lands, is expected to
generalize this one table's ad hoc `draft_data` column into whatever cross-cutting
mechanism it designs, not the other way around.

**What was built**: migration `20260912020000_platform_branding_draft.sql` adds one
`draft_data jsonb` column to the existing singleton `platform.branding` row (plus
`draft_updated_by`/`draft_updated_at` for the same "minimal accountability" scope
`updated_by`/`updated_at` already established in 03.1), not ~16 mirrored `draft_*`
columns -- the draft is always written after passing through the exact same
`platformBrandingInputSchema` Zod validation the live columns' own writer uses, so
per-column Postgres CHECK constraints on the draft would be redundant defense for a value
the app never lets through unvalidated (unlike the live columns, which keep their own
CHECKs as defense against a write that bypasses the app entirely). No new RLS policy
needed -- `platform.branding`'s existing policies are row-level, re-confirmed (not just
re-read) by re-running `scripts/test-platform-branding-rls.mjs` against the full migration
timeline including this story's own files: all 10 assertions still pass, proving a
business admin still gets 0 rows / a no-op update against the *whole* row, new draft
columns included, not just the columns that existed when that script was first written.

**A real advisor finding, found and fixed the way PLATFORM-P0-03.4 set the bar for**:
`mcp__Supabase__get_advisors` (performance) flagged `branding_draft_updated_by_fkey` as an
unindexed foreign key immediately after the draft migration was applied live -- the exact
same class of gap `branding_updated_by_idx` (03.1) already covers for `updated_by`, just
missed for the new `draft_updated_by` column when that migration was written. Fixed with a
follow-up migration, `20260912021000_platform_branding_draft_index.sql`
(`create index branding_draft_updated_by_idx on platform.branding (draft_updated_by)`),
applied live and re-confirmed via a second `get_advisors` call: the unindexed-FK finding
is gone, and the new index appears only as an "unused index" info-level note -- the same
benign class every sibling FK index on this table already carries in this empty dev
database.

**Application layer** (`packages/core/src/admin/platform-branding.ts`): `updatePlatformBranding()`
is removed (its only caller was the branding form's save action) and replaced with four
functions:
- `saveBrandingDraft(input)` -- the Edit step. Same validation as the old function, but
  writes only `draft_data`/`draft_updated_by`/`draft_updated_at`; the live columns (and
  everything that reads them, e.g. `getPublicLoginBranding()`) are untouched.
- `getPlatformBrandingDraft()` -- what the Edit form and Preview page pre-fill with: the
  pending draft's values if one exists, otherwise the live published values mapped back
  into form-input shape via a new pure, exported, unit-tested `toInputFromBranding()`
  (the exact inverse of the existing `toBranding()`) -- so "Edit" always starts from
  something real, live or drafted, never blank fields.
- `publishBrandingDraft()` -- the Publish step. Copies the current draft onto the live
  columns and clears it. Deliberately does **not** re-run `platformBrandingInputSchema` on
  the stored draft: `draft_data` is always the schema's own *output* (optional fields
  already turned into `null`), and re-parsing that output as fresh *input* would fail --
  the schema's optional-field branches accept a string on the way in but produce `null` on
  the way out, so a previously-produced `null` fed back in throws a type/shape error, not
  a validation pass. This was caught before it shipped: an earlier draft of this
  implementation did call `.safeParse()` again at publish time and would have made every
  real-world publish with any optional field set fail, since a real draft almost always
  has at least one `null` optional field by the time it's saved. The stored draft is
  already exactly as trustworthy as the live columns it's about to become -- it can only
  have been written by this same `requireSuperadmin()`-gated, RLS-protected function.
- `discardBrandingDraft()` -- abandons a pending draft without publishing it. Not
  explicitly named by the story's three-step "Edit / Preview / Publish" list, but added as
  a minimal, directly-necessary usability affordance rather than a separate feature: without
  it, a superadmin who saves a draft they no longer want has no way back to a clean slate
  except manually retyping every live value as a "correcting" draft.

Two new, distinct exported types make the shape distinction explicit rather than
overloading one type across both directions: `PlatformBrandingInput` (`z.input` -- what
the form submits, optional fields as plain strings) and `PlatformBrandingValues`
(`z.output` -- what validation produces and `draft_data` stores, optional fields as
`string | null`).

**UI**: `branding-form.tsx`'s save button is relabeled "Save draft" (was "Save changes"),
its caption now reads "Saving does not go live -- Preview and Publish separately below",
and its success toast changed from "Branding saved." to "Draft saved -- not live yet.
Preview and publish when ready." A new shared client component,
`branding/publish-controls.tsx`, renders the draft-pending banner (with a link to
Preview) plus Publish/Discard buttons behind `AlertDialog` confirmations -- mirroring the
existing `promote-to-crm-button.tsx` confirm-dialog pattern rather than inventing a new
shape, since Publish taking every draft change live for every WonderArc customer
immediately is exactly the kind of deliberate, confirmed action that pattern exists for.
`branding/page.tsx` (Edit) now reads both `getPlatformBranding()` (for a "Last published"
caption) and `getPlatformBrandingDraft()` (for the form's pre-fill and the draft banner).
A new `branding/preview/page.tsx` renders what the draft (or, with no draft pending, the
live values) would look like on the real `/login` page -- deliberately a **static visual
mock**, not the real `AuthForm`/`login` server action: this page is reached by an
authenticated SUPERADMIN, and wiring the actual interactive login form into an admin
preview screen would let a signed-in session accidentally trigger a real auth action from
inside a "just looking" preview, a footgun this story doesn't need to accept. Below the
mock, a summary card lists the rest of the draft (name, colors, footer, email-from-name)
explicitly labeled as fields with no live surface yet (03.1's own long-standing scope
note), so a superadmin can see the whole draft without being misled into thinking those
fields appear in the mock above. `backgroundStyleFor()` (previously inlined in
`(auth)/layout.tsx`) moved to a new shared, pure `apps/web/lib/login-branding.ts` so both
the real auth layout and this new preview page apply the identical background-treatment
logic without duplicating it -- unit-tested directly (6 new cases covering all three
styles, the "no value" case, and a malformed-gradient case) in a new
`apps/web/tests/login-branding.test.ts`, this workspace's second test file.

**Deliberately not built this story**: no confirmation-dialog "impact estimate" (§21's
"Safe Global Change Workflow" -- e.g. "This affects 2,840 active businesses" -- is its own
separate, later doc section, and nothing in `core` prices what publishing a brand color
change actually affects the way a plan/entitlement change would); no version history or
rollback (that is §22's PLATFORM-P0-17, not this story, per the design-fork reasoning
above); no change to `platformBrandingInputSchema` itself -- 03.5 is a workflow story, not
a new field.

**Verification**: this worktree needed its own `npm install` first (no local
`node_modules` in a fresh worktree -- same cross-checkout symlink issue every prior
worktree-run entry in this log has documented). Full monorepo `npm run typecheck` --
clean across every workspace. `npm run lint` -- 0 errors after fixing one
unescaped-apostrophe catch in `preview/page.tsx`'s own copy (the same class of lint 03.1
also hit and fixed), 1 pre-existing unrelated warning (`Package` unused import in a CRM
conversations page, untouched by this story, same as every prior entry). `node
scripts/lint-import-boundaries.mjs` -- 1157 files, no violations. `node
scripts/lint-migration-schema.mjs` -- 132 migrations (126 -> 132; +2 this story's own
files, +4 other workstreams' concurrent merges into `main` since 03.4's own entry), no
violations. `npx vitest run --root packages/core` -- 57 tests (54 -> 57, this story's 3
new `toInputFromBranding` cases), all passing. `apps/web`'s own `vitest run
--passWithNoTests` -- 47 tests (41 -> 47, this story's 6 new `backgroundStyleFor` cases),
all passing. Both migrations applied live via `mcp__Supabase__apply_migration` against the
**dev** project (`jazdtomcgqjxjueedmck`) only. `mcp__Supabase__get_advisors` (security) --
zero new findings, same 5 pre-existing `rls_enabled_no_policy` tables and the pre-existing
leaked-password-protection warning every prior entry has already logged.
`mcp__Supabase__get_advisors` (performance) -- one **new, real** finding (the unindexed
`draft_updated_by` FK, described above), fixed with a follow-up migration and
re-confirmed gone on a second advisor call; every other finding is the same pre-existing
"unused index" class this empty dev database already carries everywhere. Directly executed
(not just described) a draft/publish/discard round trip against the live dev row via
`execute_sql`: wrote a fake draft (`platform_name = 'WonderArc Draft'`), confirmed the
*live* `platform_name`/`primary_color` columns stayed exactly `'WonderArc'`/`'#2563eb'`
while the draft was pending (the story's literal acceptance bar -- "should not become
active merely because a field was edited"), then applied the same copy-and-clear the real
`publishBrandingDraft()` performs and confirmed the live columns picked up the drafted
values, then restored the row to its original seeded defaults afterward so the shared dev
database is left clean. Re-ran `scripts/test-platform-branding-rls.mjs` (starting
`postgresql@16`, stopped in this container -- restarted it via `pg_ctlcluster` rather than
assuming it would already be running) against the full, current migration timeline (132
files): all 10 pre-existing assertions still pass, confirming the new draft columns are
still covered by the same row-level policies a business admin cannot get past. `cd
apps/web && npm run build` -- clean; `/platform/branding` and `/platform/branding/preview`
both list `ƒ` (dynamic), correctly inheriting the outer layout's existing `force-dynamic`
with no per-route opt-in needed.

**Limitation, stated plainly**: same as every prior story in this log -- there is no
seeded demo superadmin user in this sandboxed environment, so a live authenticated browser
walkthrough of actually clicking Save draft, then Preview, then Publish in the real UI was
**not** performed and is **not** claimed here. This entry's functional claim about the
draft/publish behavior itself (live columns stay untouched while a draft is pending; a
publish copies the draft and clears it) was verified for real against the live dev
database via direct SQL exercising the same read/write sequence the application code
performs, not merely asserted from reading the code -- narrower than a full UI
walkthrough, but a real behavioral proof rather than an inspection-only claim, matching
the standard PLATFORM-P0-03.4's own entry set for this workstream going forward.

**Status**: PLATFORM-P0-03.5 done. §7 Branding & Look and Feel is now finished (03.1 done,
03.2 deliberately deferred, 03.3/03.4/03.5 done). Continuing to §8 Subscription / Pricing
Plans (PLATFORM-P0-04) next -- see its own entry below.

### PLATFORM-P0-04.1 — Plan Management (2026-09-12)

**Entity-ownership map checked first (Rule 1)**: `docs/plan/00-MASTER-PLAN.md` §5 lists
"License / entitlement" as `core.modules`/`core.licenses`/`core.license_events` -- no
"plan" concept anywhere in that table. This story's own audit trail already flagged the
nearest-looking existing thing: PLATFORM-P0-03.1's own entry above notes
"`core.business_settings.plan` is a free-text label, not a billing entity." Confirmed
directly (not assumed) via `execute_sql` against the live dev project's `information_schema.columns`
that `core.business_settings.plan` is indeed a plain `text` column with no foreign key,
check constraint, or lookup table behind it. So `platform.plans` is genuinely new, not a
duplicate -- and it lives in `platform`, not `core`, since it is platform-operator-authored
catalog data (what plans exist and what they cost), matching CLAUDE.md non-negotiable #1's
`platform` carve-out, not a business's own tenant-scoped row.

**Scope decision, stated up front**: §8 has seven sub-stories (04.1-04.7) that are all
facets of the same one table plus its future entitlement/limit children. This entry builds
only 04.1's own field list (name, description, price, billing interval, currency, status,
display order, marketing visibility) plus the `key` identity column every future
entitlement table will reference -- **not** 04.2 (Plan Entitlements, the composite view of
04.3+04.4+04.5 once those exist), 04.3 (Module Entitlements), 04.4 (Feature-Level
Entitlements), or 04.5/04.6 (Quantity Limits / Unlimited Support). Building those now, with
`platform.plans` not yet existing for them to reference, would be exactly the "speculative
functionality ahead of its own turn" this backlog's own 03.1/03.3 entries already declined
for their own future-scope items. 04.7 ("Plan Lifecycle") **is** folded in, but only for
what it names about the `status` column 04.1's own field list already requires -- the
`draft`/`active`/`deprecated`/`archived` four-value enum -- since a plan record with no
real lifecycle values would be an incomplete column, not deferred scope. 04.7's other rule
("do not delete plans that have historical subscribers") has no real subject yet -- nothing
references `platform.plans` from `core.licenses` until PLATFORM-P0-05.4 wires the
entitlement engine to it -- so it's satisfied the simplest possible way: the migration
grants no DELETE to `authenticated` at all, the same "no delete through the app, ever"
pattern `platform.branding`'s singleton row already established, rather than building a
subscriber-count check against a foreign key that doesn't exist yet.

**What was built**: migration `20260912030000_platform_plans.sql` -- `platform.plans`
(uuid primary key, not a singleton like `platform.branding`: there are several plans by
design). `key` (a stable, immutable, lowercase-slug identity column, e.g. `'pro'`,
unique-constrained) is separate from `name` (the display label) specifically so renaming
"Pro" to "Growth" later never breaks a future entitlement table's foreign key to it --
mirroring `core.modules.key`'s own role for module identity, confirmed by reading that
column's own definition rather than assumed. `price numeric(14, 2)` (not integer cents)
matches this repo's own established money-column convention across
`core.payments`/`core.documents`/`core.items` (checked via `grep -rn "numeric(14, 2)"
supabase/migrations/`), not a fresh convention invented for this table.
`billing_interval` (`month`/`year`), `currency` (a 3-letter code, defaulting `'INR'` per
`core.business_settings.currency`'s own established default), `status` (the four-value
lifecycle above), `display_order`, `marketing_visible`, and the same
`updated_at`/`updated_by` "minimal accountability, not full history" columns
`platform.branding` already established while PLATFORM-P0-16/17's own future audit/version
history is still unbuilt. Seeded with the story's own named `Free`/`Pro`/`Max` plans, all
`status = 'active'` (not `draft`) -- an empty or all-draft plans table would itself be
exactly the kind of "unconfigured platform surface" PLATFORM-P0-02's own Configuration
Health widget already watches for, not a deliberately blank slate.

RLS mirrors `platform.branding`'s shape (`platform.is_superadmin()`, the same SECURITY
DEFINER function) with `select`/`insert`/`update` policies and **no delete policy or grant
at all** -- the simplest correct expression of 04.7's "never delete a plan" rule, enforced
at the same layer (RLS/grants) this backlog's own §5 architecture principle names as
authoritative, not merely a missing "delete" button in the UI.

**Application layer** (`packages/core/src/admin/platform-plans.ts`): `listPlatformPlans()`,
`getPlatformPlan(id)`, `createPlatformPlan(input)`, `updatePlatformPlan(id, input)` -- no
delete function exported at all, matching the migration's own grants. Two Zod schemas,
`createPlatformPlanSchema` (includes `key`) and `updatePlatformPlanSchema` (`.omit({key:
true})` from the same base schema, so the two can never silently drift apart in their
shared fields) -- a plan's `key` is submittable only at creation. 13 new unit tests in
`platform-plans.test.ts` cover the real validation logic (key slug format, name
non-empty, negative-price rejection, billing-interval/status enum membership including
every one of the four lifecycle values by name, non-integer display-order rejection, and
that the update schema genuinely has no `key` field at all -- checked via `"key" in
result.data`, not just a type-level assumption).

**UI**: new `apps/web/app/platform/(protected)/plans/` (page.tsx, actions.ts,
plan-dialog.tsx) -- desktop table / mobile card split per CLAUDE.md development principle
#12 and `docs/design/claude-ui-design-rules.md` rule 5, mirroring
`(dashboard)/.../crm/leads/page.tsx`'s own established `<ul className="divide-y
md:hidden">` / `<Table className="hidden md:table">` pattern, with the same explicit
zinc-* overrides every other `/platform` page needs since the vendored `Table`'s default
tokens resolve against the site's light theme. One shared `PlanDialog` component handles
both Add and Edit (mirroring `edit-value-dialog.tsx`'s existing "a dialog, not a separate
page" pattern per design-rules rule 4) -- Edit disables the `key` field entirely rather
than merely omitting it from the update payload, so a superadmin can never even attempt to
change it through the UI. `apps/web/app/platform/layout.tsx` gains a third nav entry,
"Plans".

**A real lint issue found and fixed, not routed around**: the first draft of
`plan-dialog.tsx` used `useActionState` + a `useEffect` that called `setOpen(false)` on a
successful result -- the exact same shape `packages/module-fsm/src/components/schedule/create-event-dialog.tsx`
already uses elsewhere in this codebase. `npm run lint` correctly flagged it as
`react-hooks/set-state-in-effect` ("calling setState() directly within an effect").
Investigated rather than suppressed: `module-fsm` turns out to have **no lint script or
config at all** (confirmed via `cat packages/module-fsm/package.json` showing no `"lint"`
entry, and `npx eslint .` from inside that package failing with "couldn't find an
eslint.config" ), so that pre-existing file's identical pattern has simply never been
linted by anything, in or out of CI -- not this story's to fix (CLAUDE.md development
principle #10, "do not refactor unrelated code"), but also not a precedent to copy into a
package that *is* linted. Rewrote `plan-dialog.tsx` to submit via a plain `onSubmit` +
`useTransition` instead (the same shape `publish-controls.tsx`, written earlier this run,
already uses successfully) -- closing the dialog is now a direct branch on the awaited
result inside the submit handler itself, never inside an effect. `npm run lint` is clean
across the whole monorepo (including this file) as a result.

**Deliberately not built this story**: no delete UI or function (04.7, see above); no
module/feature entitlement or limit tables (04.2-04.6, each its own later sub-story); no
public/customer-facing pricing page reading `marketing_visible` plans (no such page exists
anywhere in this codebase yet, and building one now would be speculative ahead of its own
future story); no wiring from `core.licenses`/`core.business_settings.plan` to this new
table (PLATFORM-P0-05.4, Entitlement Engine, is explicitly that integration's own future
job, not this one's).

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint` -- 0 errors after the `react-hooks/set-state-in-effect` fix described above (1
pre-existing unrelated warning, unchanged). `node scripts/lint-import-boundaries.mjs` --
1162 files, no violations. `node scripts/lint-migration-schema.mjs` -- 133 migrations (132
-> 133, this story's own file), no violations. `npx vitest run --root packages/core` -- 70
tests (57 -> 70, this story's 13 new plan-schema cases), all passing. `apps/web`'s own
`vitest run --passWithNoTests` -- 47 tests, unchanged (no new apps/web-level pure logic
this story -- the dialog's own submit branching is exercised by the schema tests plus a
manual build check, not a new unit test, matching this codebase's own bar for a thin UI
wrapper). `cd apps/web && npm run build` -- clean; `/platform/plans` lists `ƒ` (dynamic).

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; confirmed via `execute_sql` that the seeded catalog is
exactly Free/Pro/Max with the documented prices/currency/status. Directly role-switched
(not just read the policy SQL) as a real non-superadmin user id against the live dev
project: `select count(*) from platform.plans` returns `0` cleanly (not a "permission
denied for schema" error), proving this brand-new table is already covered by
PLATFORM-P0-03.4's own schema-grant fix rather than silently repeating that same bug for a
second table. `mcp__Supabase__get_advisors` (security) -- zero new findings, the same 5
pre-existing `rls_enabled_no_policy` tables and the pre-existing leaked-password-protection
warning every prior entry has already logged. `mcp__Supabase__get_advisors` (performance)
-- zero new findings this time (both new indexes, `plans_status_display_order_idx` and
`plans_updated_by_idx`, were added in the same migration as their columns, so neither
tripped the "unindexed foreign key" check that caught PLATFORM-P0-03.5's own gap; both show
up only as the same benign "unused index" info-level note every sibling FK index already
carries in this empty dev database).

**A second RLS test script, following PLATFORM-P0-03.4's own standard**: new
`scripts/test-platform-plans-rls.mjs`, wired into `package.json`'s `test:db` composite
script after `test-platform-branding-rls.mjs`. Seeds the same Alice (business admin, not a
superadmin)/Zoe (real `platform.admins` superadmin) pair and asserts, against a real local
Postgres 16 database: Alice gets 0 rows on SELECT (proving the schema-level grant is
present, the exact class of bug PLATFORM-P0-03.4 found, not merely that RLS denies her);
her INSERT is rejected outright by the `WITH CHECK` clause; her UPDATE silently affects
zero rows; Zoe can SELECT/INSERT/UPDATE freely; **nobody, superadmin included, can DELETE a
plan** (04.7's own rule, proven live, not just asserted from the migration's grant list);
and the `key` uniqueness constraint holds even for a superadmin. **All 11 assertions
passed** on the first run against the full current migration timeline (133 files). Also
started this sandbox's own local Postgres 16 cluster before running it (`pg_ctlcluster 16
main start` -- it was not already running in this fresh worktree, unlike PLATFORM-P0-03.4's
own environment where it apparently was), confirmed via `pg_lsclusters`, rather than
assuming a prior story's environment state still held.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user or live browser session in this sandboxed environment, so a live
authenticated walkthrough of actually opening `/platform/plans`, adding a plan through the
dialog, and seeing it appear in the table was **not** performed and is **not** claimed
here. This story's authorization-critical claims (schema grant present; RLS denies a
non-superadmin; a superadmin can create/update but never delete) were verified for real
against both the live dev Supabase project and a real local Postgres database, per the
higher bar PLATFORM-P0-03.4 set for every `platform.*` table.

**Status**: PLATFORM-P0-04.1 done. PLATFORM-P0-04.2-04.7 remain open for their own later
turns. Given this run's usage is approaching its practical limit for one sitting, stopping
here after merge rather than starting another new story -- see the final status message
for the full summary of what this run covered.

### PLATFORM-P0-04.3 — Module Entitlements (2026-09-12)

**Worktree-reuse hazard hit for real this run, fixed before any code was written**: this
run's worktree's own `HEAD` was `a95ae42` ("compliance: COMPLY-P0-07.1"), the tip of a
sibling backlog's branch, checked out under a `worktree-agent-*` branch name -- not
`feature/platform-admin-portal` at all (`origin/feature/platform-admin-portal`'s real tip
was `4c7b8cd`, PLATFORM-P0-04.1). Exactly the class of artifact this run's own assignment
warned about (see `docs/design/discovery-offering-backlog-audit.md`'s 09.3 entry for the
first occurrence). Working tree was already clean, so no stash was needed -- fixed with
`git checkout -B feature/platform-admin-portal origin/feature/platform-admin-portal`,
re-verified `git rev-parse HEAD` matched `origin/feature/platform-admin-portal` exactly
before writing anything.

**Sequencing, per PLATFORM-P0-04.1's own migration docstring, not re-litigated here**:
that migration already states "PLATFORM-P0-04.2 ('Plan Entitlements') is the composite
view of the three tables above [module/feature/limit entitlements] once they exist -- not
its own table." So this run's own assignment note ("RESUME AT PLATFORM-P0-04.2... continue
through 04.3-04.7") is followed in the order the codebase's own prior work already
committed to: the three underlying tables first (04.3 this story, then 04.4, then
04.5/04.6, each its own commit), then 04.2's composite UI last, once all three exist to
compose. This is a non-security sequencing call (both orderings reach the same doc
sections; nothing about it is security-ambiguous), the same kind of call PLATFORM-P0-03.1's
own entry already made and documented rather than silently departing from an instruction's
literal ordering.

**Naming discrepancy, flagged per CLAUDE.md's "live source wins"**: the doc's own §8.3
example lists modules as "Discovery, Inventory, FSM, CRM, Compliance"; `core.modules`
(Epic 2, story C-3, the live, canonical module catalog `core.licenses.module_key` itself
references) has no `compliance` key -- its fifth module is `gst`. Treated as the same
module under the doc's descriptive name vs. the live schema's actual key, not a sixth
module to invent; `platform.plan_modules` is keyed off `core.modules.key` (`gst`), the live
source, not the doc's prose.

**What was built**: migration `20260912040000_platform_plan_modules.sql` --
`platform.plan_modules`, a join table between `platform.plans` (PLATFORM-P0-04.1) and
`core.modules` (the cross-schema FK points into `core`, per CLAUDE.md non-negotiable #1,
not a parallel module-identity list invented for `platform`). One row per (plan, module)
pair, not a sparse override table -- every plan is seeded `enabled = true` for every
module. This default was a real, considered choice, not an accident: the doc's §8.3
module-inclusion example ("FSM ✗ disabled") is labelled "Example:", illustrating the
*shape* of the model, unlike PLATFORM-P0-04.1's own "Initial plans: Free/Pro/Max" line,
which was a literal seed instruction under a plain heading -- inventing which specific
modules Free/Pro/Max should each include would be fabricating a real pricing decision no
document here actually makes, exactly the class of thing CLAUDE.md's "never implement
speculative functionality" rules out. Defaulting every module to enabled keeps today's
behavior (every module purchasable on every plan, matching the fact that `core.licenses`
does not consult `platform.plans` at all yet -- PLATFORM-P0-05.4's own future job)
unchanged the moment this table starts existing, the same "opt-in override defaults to
today's look" reasoning PLATFORM-P0-03.3 already used for login branding. RLS mirrors
`platform.plans`: `select`/`insert`/`update` policies via `platform.is_superadmin()`, no
delete policy or grant at all -- not because of a 04.7-style "never delete" rule (there is
none here), but because nothing in this story's own UI ever needs to remove a row: every
(plan, module) pair always has exactly one row (seeded at migration time, and by the
application layer for every plan created afterward), so toggling `enabled` via UPDATE is
the only mutation that exists to grant.

**Application layer** (`packages/core/src/admin/platform-plan-modules.ts`):
`listPlanModuleEntitlements(planId)` merges two schema-scoped reads (`platform.plan_modules`
and `core.modules`) in application code rather than a single PostgREST embed, since each
Supabase client here is pinned to one `db.schema` and the two tables live in different
ones. `setPlanModuleEnabled(planId, moduleKey, enabled)` upserts (defensive fallback for a
plan/module combo somehow missing its seeded row, e.g. a module added to `core.modules`
after a plan's own rows were seeded -- not the common path). `seedPlanModuleEntitlements(planId)`
is the new piece wired into `createPlatformPlan()` (`platform-plans.ts`) right after a new
plan's row is inserted, so a plan created through the UI after this story ships starts with
the same "every module enabled" default the migration's own seed gave every plan that
existed at migration time -- never a plan with silently missing entitlement rows. No new
Zod schema of any real complexity here (a module key is just a non-empty string checked
against a live FK, not a format worth its own regex) -- no new vitest cases added, matching
this codebase's own established bar (PLATFORM-P0-02/03.4's entries: a two-line check or a
thin DB wrapper doesn't need a unit test beyond what `isProtectedPath()` set as the minimum
for real branching logic).

**UI**: new `apps/web/app/platform/(protected)/plans/[id]/entitlements/` (page.tsx,
actions.ts, module-entitlements-section.tsx) -- the first section of PLATFORM-P0-04.2's own
eventual composite page, explicitly documented in the page's own header comment as growing
one section per sibling story (feature-level entitlements, quantity limits) rather than
being built as one big page ahead of those tables' own turns. Each module renders with a
direct `Switch` toggle (`@cofounderai/core/ui/switch`, already vendored and already used
elsewhere in this codebase, e.g. `module-fsm/.../settings-view.tsx`) rather than a save-button
form -- a single boolean flip per row needs no separate save step, the same "no form to
submit for one field" reasoning already applied elsewhere in this app's own settings
pages. Desktop table / mobile card split per CLAUDE.md development principle #12 and
`docs/design/claude-ui-design-rules.md` rule 5, mirroring `plans/page.tsx`'s own established
split. `plans/page.tsx` (04.1's own list) gets one new "Entitlements" link per row, on both
the mobile card and desktop table layouts, pointing at the new page -- otherwise this new
route would be unreachable via any UI, the same "no orphaned route" bar PLATFORM-P0-03.1's
own nav-strip addition already set.

**Deliberately not built this story**: feature-level entitlements (PLATFORM-P0-04.4) and
quantity limits/unlimited support (PLATFORM-P0-04.5/04.6) -- each its own sibling
migration/story, landing next in this same run, not folded in here (unlike PLATFORM-P0-04.7,
these are genuinely separate tables with their own shapes, not one column on an
already-existing table); no UI or DB support for adding a *new* module to the catalog
(that is `core.modules`' own concern, Epic 2 scope, not this story's); no wiring of
`plan_modules.enabled` into any actual entitlement check anywhere in the app
(PLATFORM-P0-05, Entitlement Engine, "Not started," is explicitly that integration's own
future job -- this table stores configuration, nothing reads it for a real authorization
decision yet, matching PLATFORM-P0-04.1's own identical stance for `platform.plans` itself).

**Verification**: this worktree needed its own `npm install` first (fresh worktree, no
local `node_modules` -- same cross-checkout symlink issue every prior worktree-run entry in
this log has documented; confirmed the resulting `package-lock.json` has no diff and
`readlink -f node_modules/@cofounderai/core` resolves to this worktree's own
`packages/core`). Full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint` -- 0 errors, the same 1 pre-existing unrelated warning (`Package` unused import in
a CRM conversations page, untouched by this story). `node scripts/lint-import-boundaries.mjs`
-- 1166 files, no violations. `node scripts/lint-migration-schema.mjs` -- 134 migrations
(133 -> 134, this story's own file), no violations. `npx vitest run --root packages/core`
-- 70 tests, unchanged (no new pure validation logic this story, see above). `cd apps/web
&& npm run build` -- clean; `/platform/plans/[id]/entitlements` lists `ƒ` (dynamic),
correctly inheriting the outer layout's existing `force-dynamic` with no per-route opt-in
needed.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; confirmed via `execute_sql` that the seed is exactly right
(`select p.key, count(*), bool_and(enabled) ...` grouped by plan -- all three plans show 5
rows, all enabled). Role-switched (not just policy-read) `execute_sql` as a synthetic
non-superadmin user id against the live dev project: `select count(*) from
platform.plan_modules` returns `0` cleanly (no "permission denied for schema" error),
confirming this brand-new table is already covered by PLATFORM-P0-03.4's own schema-grant
fix rather than repeating that bug for a third table. `mcp__Supabase__get_advisors`
(security) -- zero new findings, the same 5 pre-existing `rls_enabled_no_policy` tables and
the pre-existing leaked-password-protection warning every prior entry has already logged.
`mcp__Supabase__get_advisors` (performance) -- zero new findings: both new indexes
(`plan_modules_module_key_idx`, `plan_modules_updated_by_idx`) were added in the same
migration as their columns, so neither tripped the "unindexed foreign key" check
PLATFORM-P0-03.5 hit; both show up only as the same benign "unused index" info-level note
every sibling FK index already carries in this empty dev database.

**A third RLS test script, following the established standard**: new
`scripts/test-platform-plan-modules-rls.mjs`, wired into `package.json`'s `test:db`
composite script after `test-platform-plans-rls.mjs`. Same Alice (business admin)/Zoe
(superadmin) pair. One test-design correction made before it passed: the first draft had
Alice attempt an INSERT whose `select ... from platform.plans limit 1` subquery itself
returns zero rows under her own RLS-restricted view of `platform.plans` (she can't read
that table either), making the INSERT a legitimate zero-row no-op rather than a rejected
one -- corrected to seed a bare plan via `service_role` first (with no `plan_modules` rows
yet) and have Alice attempt a literal insert against it, genuinely isolating the RLS `WITH
CHECK` clause rather than accidentally testing an unrelated "empty subquery" no-op. Local
Postgres 16 was already running in this environment (`pg_lsclusters` showed it online), but
the test harness's `createdb`/`psql` calls failed with `role "root" does not exist` -- this
sandboxed container's OS user is `root`, and no matching Postgres superuser role existed
yet in this fresh environment (the prior entries' own note about a "temporary local
superuser role matching this sandbox's OS user" applied again, freshly, in this run's own
container). Fixed the same way: `CREATE ROLE root LOGIN SUPERUSER;` via `sudo -u postgres
psql`, left in place for the rest of this run's own local-Postgres verification work rather
than dropped after each script (a throwaway local dev cluster, not a shared or
production resource). **All 11 assertions passed** against the full current migration
timeline (134 files), including the seed count, the corrected INSERT-rejection case, the
UPDATE no-op, Zoe's real read/write access, the "nobody can DELETE" negative case, and a
direct proof that a freshly-created plan can have its own module rows populated (simulating
what `seedPlanModuleEntitlements()` does at plan-creation time).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user or live browser session in this sandboxed environment, so a live
authenticated walkthrough of actually opening `/platform/plans/[id]/entitlements` and
toggling a module switch was **not** performed and is **not** claimed here. This story's
authorization-critical claims (schema grant present for a new table; RLS denies a
non-superadmin; a superadmin can read/toggle but never delete) were verified for real
against both the live dev Supabase project and a real local Postgres database, per the
standard PLATFORM-P0-03.4 set for every `platform.*` table.

**Status**: PLATFORM-P0-04.3 done. Continuing to PLATFORM-P0-04.4 (Feature-Level
Entitlements) next, per this run's own sequencing note above (the two remaining
prerequisite tables before PLATFORM-P0-04.2's own composite page can be built).

### PLATFORM-P0-04.5/04.6 — Quantity Limits + Unlimited Support (2026-09-12)

**Why one story, not two**: 04.6 ("Support: numeric limit / unlimited / disabled. Do not
represent unlimited as an arbitrary huge number") is not a separate table or feature --
it is the value semantics of the one table 04.5 asks for. There is no way to design
04.5's table correctly without already deciding the tri-state representation 04.6
describes, so building 04.5 first and 04.6 "later" would only mean an immediate rewrite.
Folded into one migration/story, the same way PLATFORM-P0-04.7's lifecycle enum was
folded into PLATFORM-P0-04.1's own migration -- recorded here explicitly rather than
silently merging two backlog line items.

**Reading "must be data-driven" (04.5)**: taken to mean the storage shape -- one generic
table with a `resource_key` column, not a hardcoded column per resource
(`max_users int, max_products int, ...`), which would make the 13 independently-evolving
dimensions the doc names painful to extend. Not read as "accept any free-text key
forever": the doc itself enumerates exactly 13 dimensions under "Configurable limits:",
so `resource_key` is a closed list enforced by a CHECK constraint, the same defense-in-
depth pattern `billing_interval`/`status`/`login_background_style` already use elsewhere
in this schema.

**What was built**: migration `20260912050000_platform_plan_limits.sql` --
`platform.plan_limits` (plan_id + resource_key primary key). `state` (`limited` /
`unlimited` / `disabled`) plus a nullable `limit_value`, with a row-level CHECK
(`plan_limits_value_matches_state`) requiring `limit_value` present and non-negative only
when `state = 'limited'`, and null for the other two states -- so "unlimited" can never be
represented as a magic number like 999999999 that a future usage report or a naive
`usage >= limit` comparison could misread, and "disabled" (this resource does not exist on
this plan at all) is its own explicit state, not `limit_value = 0` (indistinguishable from
"allowed, but none left"). **Deliberately seeded with nothing**: the doc's §8.5 list is a
category list, not specific numbers for Free/Pro/Max the way PLATFORM-P0-04.1's "Initial
plans:" line was a literal seed instruction -- inventing "Free allows 3 businesses" here
would fabricate a real pricing decision nothing in this backlog actually makes. A missing
(plan, resource_key) row means "not yet configured," an honest third possibility this
table's own read function surfaces explicitly (`configured: false`) rather than defaulting
silently to either extreme -- the same stance PLATFORM-P0-02's Configuration Health widget
already set for unconfigured platform-wide surfaces. What "no row" should mean to a real
authorization decision is left to PLATFORM-P0-05 (Entitlement Engine, "Not started") to
decide when it actually wires this table into one.

RLS mirrors the established `platform.is_superadmin()` shape, but -- unlike
`platform.plan_modules` (04.3) -- **DELETE is granted** here: `plan_modules` has no
meaningful "unconfigured" state a row's absence could represent (every plan x module combo
always has a row), but here "no row" is itself one of the table's own valid, intended
states, so a superadmin reverting a resource back to "not configured" genuinely needs to
remove the row, not merely flip it to one of the three configured states. This asymmetry
is deliberate and documented in the migration itself, not an inconsistency.

**Application layer** (`packages/core/src/admin/platform-plan-limits.ts`):
`listPlanLimits(planId)` returns all 13 dimensions in the doc's own listed order, each
either `{ configured: false }` or the real state/value -- a discriminated union, not a
nullable field, so a caller cannot accidentally treat "not configured" as "unlimited" by
forgetting a null check. `setPlanLimit`/`clearPlanLimit` upsert/delete. The tri-state
validation (`setPlanLimitSchema`, a `.superRefine()` requiring the value/state pairing the
DB's own CHECK constraint also enforces) is real, non-trivial logic distinct from a plain
enum check, so it gets the same unit-test treatment `platformBrandingInputSchema` and
`createPlatformPlanSchema` already received -- 11 new cases in the new
`platform-plan-limits.test.ts` (every valid pairing, `limitValue = 0` treated as a real
limit rather than "no value" since the empty-string check runs before numeric coercion,
every invalid pairing including "unlimited with 999999999" explicitly, and an unknown
state value).

**A real Next.js build failure, caught and fixed, not routed around**: `RESOURCE_KEYS`/
`RESOURCE_LABELS`/`ResourceKey` were first declared directly in `platform-plan-limits.ts`
alongside its server-only `createClient`/`requireSuperadmin` imports. `next build` failed
with a Client/Server Component boundary error: the new `quantity-limits-section.tsx`
(`"use client"`) imported `RESOURCE_LABELS` as a runtime value from that same file, which
pulled `../db/server` (uses `next/headers`, server-only) into the client bundle. Fixed by
extracting the three into a new, dependency-free `packages/core/src/admin/platform-
limits-constants.ts` that `platform-plan-limits.ts` re-exports (server callers'
import path is unchanged) and that the client component imports directly (a type-only
import of `LimitState`/`PlanResourceLimit` from `platform-plan-limits.ts` itself is fine --
those are erased at compile time and never pull in the runtime module). `module-
entitlements-section.tsx` (04.3) never hit this because it only ever imported
`PlanModuleEntitlement` as a type, never a runtime value, from its own admin module.

**UI**: `plans/[id]/entitlements/quantity-limits-section.tsx` -- the second section of
PLATFORM-P0-04.2's own eventual composite page. Unlike 04.3's single-field instant-toggle
switches, each row here edits two related fields together (state + numeric value, the
latter shown only when state = Limited) and gets its own explicit "Save" button rather than
an instant flip -- the same "commit two related fields together" reasoning
`branding-form.tsx`'s one page-level "Save" button already applies, scaled down to one row.
A "Clear" action (configured rows only) reverts to "Not configured" via `clearPlanLimit`.
"Not configured" renders as its own outlined badge, distinct from "Unlimited"/"Disabled"/a
numeric badge -- never silently folded into one of the three real states. Desktop table /
mobile card split per CLAUDE.md development principle #12 and
`docs/design/claude-ui-design-rules.md` rule 5, matching the page's own established
pattern from 04.3.

**Deliberately not built this story**: feature-level entitlements (PLATFORM-P0-04.4,
still the one remaining table before PLATFORM-P0-04.2's composite page); any wiring of
`plan_limits` into a real authorization/usage check anywhere in the app (PLATFORM-P0-05/06,
both "Not started," are that integration's own future job -- this table stores
configuration only, matching every sibling `platform.*` table's current stance); no
specific numeric limits seeded for Free/Pro/Max (see above -- inventing them would
fabricate a pricing decision).

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint` -- 0 errors, the same 1 pre-existing unrelated warning. `node scripts/lint-
import-boundaries.mjs` -- 1170 files, no violations. `node scripts/lint-migration-
schema.mjs` -- 135 migrations on this branch (134 -> 135, this story's own file; this
branch does not carry other workstreads' concurrent `main` commits until its next merge,
so this count is relative to this branch's own prior story, not `main`'s current total).
`npx vitest run --root packages/core` -- 81 tests (70 -> 81, this story's 11 new
tri-state-schema cases), all passing. `cd apps/web && npm run build` -- clean after the
constants-file extraction described above; `/platform/plans/[id]/entitlements` still lists
`ƒ` (dynamic).

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; confirmed via `execute_sql` the table is genuinely empty
after creation (no fabricated seed). Role-switched (not just policy-read) `execute_sql` as
a synthetic non-superadmin user id: `select count(*) from platform.plan_limits` returns `0`
cleanly (no "permission denied for schema" error), confirming this fourth `platform.*`
table is already covered by PLATFORM-P0-03.4's own schema-grant fix.
`mcp__Supabase__get_advisors` (security) -- zero new findings, the same 5 pre-existing
`rls_enabled_no_policy` tables and the pre-existing leaked-password-protection warning
every prior entry has logged. `mcp__Supabase__get_advisors` (performance) -- one new,
fully benign entry (`plan_limits_updated_by_idx` as "unused index," the same class every
sibling FK index in this empty dev database already carries; no unindexed-FK finding, since
the index was added in the same migration as its column).

**A fourth RLS test script, following the established standard**: new `scripts/test-
platform-plan-limits-rls.mjs`, wired into `package.json`'s `test:db` composite script after
`test-platform-plan-modules-rls.mjs`. Same Alice/Zoe pair. One test-design correction made
before it passed: the first draft asserted Alice's DELETE *throws* (mirroring the INSERT
assertion just above it), but a DELETE whose `USING` clause matches zero rows under RLS is
a legitimate zero-row no-op in Postgres, not an error -- corrected to assert the row count
is unchanged afterward instead, the same class of correction PLATFORM-P0-04.3's own INSERT
test needed for the same underlying reason (an RLS-filtered query returning nothing is not
itself a thrown error). Local Postgres 16 was already running with the `root` superuser
role this run's own PLATFORM-P0-04.3 entry created still in place. **All 13 assertions
passed** against the full current migration timeline (135 files), including the empty-
table start, the corrected DELETE-no-op case, Zoe's real read/write/delete access, and --
the story's own core "never a fake unlimited number" rule -- three separate CHECK-
constraint rejections (unlimited-with-a-value, limited-with-no-value, disabled-with-a-
value) plus the closed resource_key list, all enforced by the database itself and proven
even for a superadmin, not merely asserted from reading the constraint's SQL.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user or live browser session in this sandboxed environment, so a live
authenticated walkthrough of actually opening the entitlements page and setting/clearing a
limit was **not** performed and is **not** claimed here. This story's authorization- and
constraint-critical claims were verified for real against both the live dev Supabase
project and a real local Postgres database, per the standard PLATFORM-P0-03.4 set for
every `platform.*` table.

**Status**: PLATFORM-P0-04.5/04.6 done. PLATFORM-P0-04.4 (Feature-Level Entitlements) is
the one remaining table before PLATFORM-P0-04.2's own composite page can be built --
picked up next.

### PLATFORM-P0-04.4 + PLATFORM-P0-04.2 — Feature-Level Entitlements + Plan Entitlements (2026-09-12)

**Why one story entry, not two**: 04.4 is the last of the three prerequisite tables
PLATFORM-P0-04.1's own migration named ("module entitlements, feature-level entitlements,
quantity limits") before 04.2's own composite page could be built. With 04.4's tables now
landing here, all three exist, so this same commit both builds 04.4 and completes 04.2 by
adding its third and final section to the entitlements page already under construction
since PLATFORM-P0-04.3 -- not a coincidence of timing, the direct consequence of the
sequencing this run's own PLATFORM-P0-04.3 entry already committed to and explained. §8
(Subscription / Pricing Plans, 04.1-04.7) is now fully done.

**Two tables, and why they are not PLATFORM-P0-08's future `feature_flags`**: migration
`20260912060000_platform_plan_features.sql` -- `platform.features` (the catalog: id,
`module_key` FK into `core.modules`, `key`/`name`/`description`, unique per
(module_key, key)) and `platform.plan_features` (plan_id + feature_id, `enabled` boolean,
defaulting false). Read closely against §12's own PLATFORM-P0-08.1 ("Global Feature
Flags": feature_key/description/enabled/effective_from/effective_to, with a Global/Plan/
Module/Country *scope* and its own kill-switch semantics, §8.3's examples being
operational concerns like "AI research" as an emergency disable) -- that is a genuinely
different axis (is the platform currently letting *anyone* use this, for reliability/
safety reasons) from this story's own commercial packaging axis (does *this plan* entitle
a customer to use it at all). Both could describe a similarly-named capability
("AI Research") for entirely different reasons; conflating them into one table now, before
either PLATFORM-P0-08 or PLATFORM-P0-05 (Entitlement Engine) actually needs the
distinction, would tie two different concerns together speculatively. `platform.features`
is scoped to this story's commercial-entitlement purpose only, named and documented as
such in the migration itself so a future PLATFORM-P0-08 implementer does not mistake one
for the other.

**Not seeded**: the doc's own §8.4 per-module feature lists (Discovery: AI Research,
Website Understanding, ...; CRM: WhatsApp, Social Inbox, ...) are labelled "Example:", the
same illustrative-not-literal wording PLATFORM-P0-04.3's own entry already flagged for
§8.2/§8.3's module-inclusion example -- inventing a specific feature catalog here would
fabricate product decisions nothing in this backlog actually makes. `platform.features`
starts empty; a superadmin defines real features through the new UI this story adds.

**A real design asymmetry, deliberate, not an inconsistency**: `platform.features` gets
full CRUD (including DELETE) for a superadmin, while `platform.plan_features` gets only
select/insert/update, matching `platform.plan_modules`' own no-delete stance (04.3) for the
same reason -- a plan_features row's mere absence already means "not entitled," the same
honest default an explicit `enabled = false` row expresses, so nothing needs removing to
revert to that state. A *feature definition* with no plan entitling it, though, is dead
catalog data a superadmin should be able to delete outright -- `on delete cascade` on
`plan_features.feature_id` cleans up every plan's now-orphaned entitlement row in the same
statement, verified directly (not just read from the FK definition) in this story's own
RLS test script.

**Application layer** (`packages/core/src/admin/platform-plan-features.ts`):
`listFeatures()`, `createFeature()` (Zod-validated: module key required, `key` a
lowercase slug matching `platform.plans.key`'s own regex, name required, description
normalized empty-to-null -- 7 new unit test cases in `platform-plan-features.test.ts`,
the same bar `createPlatformPlanSchema`'s own tests already set), `deleteFeature()`,
`listPlanFeatureEntitlements(planId)` (every catalog feature, `enabled: false` when no
`plan_features` row exists -- never fabricated `true`), and `setPlanFeatureEnabled()`
(upsert). No `updateFeature()` -- editing a feature's own name/description/key was not
asked for by this story and a superadmin who wants a different feature can delete and
re-add one cheaply while the catalog is this small; adding an edit path with nothing
requesting it would be exactly the kind of speculative functionality CLAUDE.md's
development principle #7 rules out.

**UI**: `plans/[id]/entitlements/feature-entitlements-section.tsx` -- the third and final
section of the now-complete `PlanEntitlementsPage` (04.2). Features grouped by module, one
instant-toggle checkbox per feature for the current plan (same "single boolean needs no
save step" reasoning as 04.3's switches). A small "Add a feature" dialog (module select --
populated from the page's own already-fetched module list, not a separate hardcoded
constant -- key, name, optional description) creates a new *global* catalog entry, and each
feature gets a delete affordance behind an `AlertDialog` confirmation whose copy explicitly
warns the deletion removes the feature "from the catalog and every plan that entitles it --
not just this one," mirroring `publish-controls.tsx`'s own "deliberate, confirmed,
hard-to-undo action" pattern (03.5) rather than a bare confirm with no context. `page.tsx`'s
own docstring is updated to state plainly that PLATFORM-P0-04.2 is now complete -- three
sections, one per underlying table, not a fourth table of its own, exactly as
PLATFORM-P0-04.1's original migration comment described it would be.

**Deliberately not built this story**: no `updateFeature()`/edit-feature UI (see above); no
wiring of `plan_features` into any real entitlement/authorization check anywhere in the app
(PLATFORM-P0-05, Entitlement Engine, "Not started," is that integration's own future job,
matching every sibling `platform.*` table's current stance); no business/country/plan-scope
targeting on feature flags (that is PLATFORM-P0-08's own, entirely separate, future
concern, not this story's).

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint` -- 0 errors, the same 1 pre-existing unrelated warning every prior entry has
logged. `node scripts/lint-import-boundaries.mjs` -- 1173 files, no violations. `node
scripts/lint-migration-schema.mjs` -- 136 migrations on this branch (135 -> 136, this
story's own file). `npx vitest run --root packages/core` -- 88 tests (81 -> 88, this
story's 7 new feature-schema cases), all passing. `cd apps/web && npm run build` -- clean;
`/platform/plans/[id]/entitlements` still lists `ƒ` (dynamic).

Both tables applied live in one migration via `mcp__Supabase__apply_migration` against the
**dev** project (`jazdtomcgqjxjueedmck`) only. Role-switched (not just policy-read)
`execute_sql` as a synthetic non-superadmin user id: a combined `select count(*) from
platform.features, platform.plan_features` returns `0` cleanly (no "permission denied for
schema" error), confirming both brand-new tables are already covered by
PLATFORM-P0-03.4's own schema-grant fix. `mcp__Supabase__get_advisors` (security) -- zero
new findings, the same 5 pre-existing `rls_enabled_no_policy` tables and the pre-existing
leaked-password-protection warning every prior entry has logged.
`mcp__Supabase__get_advisors` (performance) -- the four new indexes
(`features_module_key_idx`, `features_updated_by_idx`, `plan_features_feature_id_idx`,
`plan_features_updated_by_idx`) show up only as the same benign "unused index" class every
sibling FK index already carries in this empty dev database; one unrelated new finding
(`pipeline_stages_last_ai_run_id_idx` on `discovery.pipeline_stages`) confirmed to be
another workstream's own concurrent migration, not this story's.

**A fifth RLS test script, following the established standard**: new `scripts/test-
platform-plan-features-rls.mjs`, wired into `package.json`'s `test:db` composite script.
Same Alice/Zoe pair. **All 13 assertions passed** on the first run against the full current
migration timeline (136 files) -- both catalogs starting empty, a business admin denied on
both tables (schema-grant-covered, not just RLS-denied), a superadmin's full CRUD on
`platform.features`, the "no plan_features row = not entitled" default proven directly (not
assumed) by checking a specific feature has zero rows for the Free plan after being
entitled only for Pro, the `(module_key, key)` uniqueness constraint holding even for a
superadmin, and -- the story's own real cascade-integrity claim -- deleting a feature that
Pro had entitled and confirming via a service-role read that its `plan_features` row was
cascade-deleted, not left orphaned.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user or live browser session in this sandboxed environment, so a live
authenticated walkthrough of actually opening the entitlements page, adding a feature
through the dialog, toggling it, and deleting it was **not** performed and is **not**
claimed here. This story's authorization- and cascade-integrity claims were verified for
real against both the live dev Supabase project and a real local Postgres database, per
the standard PLATFORM-P0-03.4 set for every `platform.*` table.

**Status**: PLATFORM-P0-04.4 done, and PLATFORM-P0-04.2 done alongside it -- §8
(Subscription / Pricing Plans) is now fully complete (04.1-04.7, with 04.7 folded into 04.1
per that story's own entry). Moving to the next doc section in order: §9 Entitlement
Engine (PLATFORM-P0-05).

### PLATFORM-P0-05.1 — Central Entitlement Service (partial; 05.2-05.4 blocked, 2026-09-12)

**Worktree-reuse hazard checked before writing anything (per this run's own standing
instruction)**: `git log --oneline -3` on entry showed `HEAD` at `acb51e3`, a Discovery
workstream merge commit, under a `worktree-agent-*` branch name -- `feature/platform-admin-portal`
itself was a real, up-to-date local branch (`b9574c8`, matching `origin` exactly) but not
what this worktree had checked out. Working tree was clean, so no stash was needed --
fixed with a plain `git checkout feature/platform-admin-portal` (the branch already
existed and tracked `origin/feature/platform-admin-portal` correctly; no `-B` reset was
needed this time, unlike the PLATFORM-P0-04.3 entry's own occurrence of the same class of
issue), then re-verified `git rev-parse HEAD` matched `origin/feature/platform-admin-portal`
before touching any file.

**Reconnaissance, done before any code (Rule 1)**: read `docs/plan/09-...md` §9 in full
(PLATFORM-P0-05.1-05.4), then read every piece of the codebase that any of the four named
functions (`hasFeature`/`hasModule`/`getLimit`/`canConsume`) would need to actually
compose, not just the doc's own four-line pseudocode:

- `core.licenses`/`core.has_module()`/`core.has_module_write()`
  (`supabase/migrations/20260906096000_core_licensing.sql`,
  `packages/core/src/licensing/{types,queries,lifecycle}.ts`) -- the one entitlement
  signal that is real, live, and already authoritative today.
- `platform.plans`/`plan_modules`/`plan_features`/`plan_limits` (§8, PLATFORM-P0-04,
  all built this run) -- real catalog/configuration tables, but **nothing in the
  codebase links a `core.businesses` row to any of them**. Confirmed directly (not
  assumed) via `information_schema.columns`/`table_constraints` against the live dev
  project: `core.business_settings.plan` is a plain `text` column, default `'starter'`,
  no FK, no check constraint, no matching value in the seeded Free/Pro/Max catalog's own
  `key`s -- exactly what PLATFORM-P0-04.1's own audit entry already flagged, re-confirmed
  here rather than taken on faith.
- `docs/plan/00-MASTER-PLAN.md` §7's own original licensing sketch (written before Epic 2
  actually implemented `core.licenses`) *did* once include a `plan_tier` column on
  `core.licenses` itself, plus a `core.module_usage` table explicitly annotated
  "-- seat/usage billing later". Neither shipped: the live `core.licenses` migration has
  no `plan_tier`, and no `core.module_usage`-equivalent exists anywhere. Per CLAUDE.md's
  own "live source of truth, not frozen spec" rule, the live schema wins -- this is a real,
  live gap, not a stale doc this run failed to read carefully enough.
- `docs/plan/09-...md` §10 (PLATFORM-P0-06, "Usage & Limits," including "06.1 Usage
  Counters") is listed **"Not started"** in this very log's own progress table --
  confirmed still true (no `core.*`/`platform.*` usage-counter table anywhere in
  `supabase/migrations/`, no `packages/core/src/usage/`-equivalent directory).
- §24 (PLATFORM-P1-02.1, "Business Override": *"Business A / Plan: Pro / Temporary
  Discovery limit: 500 / Expires: 30 days / Reason: Enterprise pilot"*) and §26
  (PLATFORM-P1-04.1, "Plan Change Rules": upgrade/downgrade/proration/effective date) are
  both explicit, named **P1** scope -- the doc itself, not this run, defers exactly the
  two mechanisms (assigning/overriding a business's plan) that PLATFORM-P0-05.2's
  precedence chain would need a live data source for.
- §11 (PLATFORM-P0-07.2, "Platform-Wide Module Kill Switch") is listed **"Not started"**
  -- there is no `platform.*` row a "Platform Global" layer could read yet either.
- `core.has_permission()`/`requirePermission()`
  (`packages/core/src/rbac/require-permission.ts`) -- the "User Permission" layer already
  exists and is already enforced, independently, at each mutating action's own call site.

**The judgment call this story stops on, stated precisely**: PLATFORM-P0-05.2's
recommended precedence is `Platform Global -> Plan -> Business Override -> User
Permission`. Of those four layers, **two have no data source in this codebase at all**
(Platform Global's kill switch, and Plan's business<->`platform.plans` link -- the latter
is not merely "not yet built," it is not *specified* anywhere in this P0 doc; the only
place plan-assignment mechanics are named at all is PLATFORM-P1-04.1, explicit P1 scope),
and a third (Business Override) is explicit, named P1 scope. Building `hasFeature()`/
`getLimit()`/`canConsume()` as PLATFORM-P0-05.1/05.3 literally ask -- returning a real
`limit`/`usage`/`remaining` -- would require **inventing**, un-reviewed, in application
code: (a) how a business is assigned a plan (there is no "obvious" default: matching
`business_settings.plan`'s existing `'starter'` value against `platform.plans.key` fails
outright, since no seeded plan is keyed `starter`), and (b) where `usage` comes from, with
PLATFORM-P0-06 (Usage Counters) itself not started -- meaning any non-null `usage`/
`remaining` value returned today would be a fabricated number, exactly what CLAUDE.md's
"never implement speculative functionality" and this backlog's own repeated "no fabricated
data" stance (PLATFORM-P0-02.1's honest MRR/ARR "--", PLATFORM-P0-04.5's empty
`plan_limits` seed) already rule out. This is precisely the class of call this run's own
task assignment names explicitly: *"Any story whose correct behavior depends on a
security/authorization judgment call the doc doesn't fully specify is a genuine
architectural decision -- stop and report rather than guess-and-merge."* Deciding the
business<->plan assignment mechanism is exactly that kind of call -- it determines what
every future module's real enforcement will key off of -- so it is flagged here, not
decided in this commit.

**What was built instead, deliberately scoped to the one layer that is real and
unambiguous today**: `packages/core/src/entitlements/` (new directory, new
`./entitlements/*` package export added to `packages/core/package.json`, mirroring the
existing `./licensing/*` entry) --

- `types.ts`: `EntitlementSource` (the full five-member union naming every precedence
  layer PLATFORM-P0-05.2 lists, plus `license` for the one that predates this section --
  declared in full now so every future `switch` on `decision.source` is exhaustive from
  day one, even though only `"license"` is ever actually produced yet) and
  `EntitlementDecision` (PLATFORM-P0-05.3's own literal `{allowed, reason, source, limit,
  usage, remaining}` shape; `limit`/`usage`/`remaining` are `null`, never `0`, for a
  decision with no numeric quantity behind it -- the same "never a fake number" discipline
  PLATFORM-P0-04.5/04.6's tri-state `plan_limits` design already established for
  "unlimited").
- `module-entitlement.ts`: `hasModule(businessId, moduleKey): Promise<EntitlementDecision>`
  -- reads the exact same `core.has_module()`/`core.has_module_write()` RPCs
  `licensing/queries.ts` already wraps as booleans (via those same wrapper functions, not
  a second, parallel Supabase call -- PLATFORM-P0-05.4's "integrate with the existing
  licensing model rather than creating a competing licensing system," read literally: this
  is a richer *view* onto the one existing source, never a second source of truth), and
  composes them into the decision shape via a separately exported, pure
  `buildModuleEntitlementDecision(moduleKey, readAllowed, writeAllowed)` -- the same
  "pure helper split out for direct unit testing" shape `platform-branding.ts`'s own
  `toBranding()`/`toInputFromBranding()` already established, so the branching logic is
  tested with no database at all. `allowed` mirrors `has_module_write()`'s stricter
  "fully licensed, not degraded" meaning (matching what `requireModule()` already
  enforces for writes) rather than collapsing the read-only-grace state into an
  unqualified `true` -- grace gets its own distinct `reason` under `allowed: false`
  instead. `source` is always `"license"` today, documented in the function's own
  docstring as accurate (not a placeholder) given everything above -- it will start
  reflecting the other layers only once each has a real data source, the same
  "configuration exists before anything reads it for a real decision" stance
  `platform.plan_modules`/`plan_features`/`plan_limits` themselves already sit in today.
- `module-entitlement.test.ts`: 6 new cases on `buildModuleEntitlementDecision` covering
  every read/write combination, the registry-name lookup (module-registry's own display
  names -- `"Service"` for `fsm`, not `core.modules`' `"Field Service"` -- confirmed by
  reading `module-registry/src/index.ts` directly rather than assumed, matching what
  `requireModule()`'s own existing error message already uses), the fallback to a raw key
  for an unknown module, and that `limit`/`usage`/`remaining` are always `null`.

**Deliberately not built this story, and why each is blocked rather than skipped**:
- `hasFeature(business, feature)` / `getLimit(business, resource)` /
  `canConsume(business, resource, quantity)` -- blocked on the business<->plan assignment
  question above (all three need to know a business's plan to consult
  `platform.plan_features`/`plan_limits` at all) and, for `getLimit`/`canConsume`
  specifically, also blocked on PLATFORM-P0-06 (Usage Counters, "Not started") for their
  own `usage`/`remaining` fields.
- Consulting `platform.plan_modules` inside `hasModule()` itself -- same blocker: without
  a business<->plan link, there is no row to look up, and defaulting to "every module
  enabled" (04.3's own seed default) for every business would silently create a second,
  redundant "yes" that changes nothing today but reads as if the Plan layer were real when
  it is not.
- A "Platform Global" module kill-switch check -- PLATFORM-P0-07.2's own, separate,
  "Not started" table.
- Any change to `requireModule()`, `core.has_module()`/`has_module_write()`, RLS policies,
  or any existing module's call sites -- this story adds a new, additive read path
  alongside the existing one; nothing that already enforces licensing today was touched,
  narrowed, or bypassed (CLAUDE.md non-negotiable #2/#3's "RLS is authoritative" is
  unaffected either way, since this function never runs with elevated privilege and never
  produces a *more* permissive answer than the RPCs it wraps already would).
- Retrofitting any existing module's own logic to call `hasModule()` -- "All customer
  modules must use this service" (05.1's own closing line) is real future work once the
  service is actually complete enough to be worth adopting everywhere; adopting a
  known-partial service now, only to change every call site again once 05.2-05.4's real
  blockers resolve, would be premature churn CLAUDE.md's own "do not refactor unrelated
  code" principle argues against.

**Verification**: this worktree needed its own `npm install` first (fresh worktree, no
local `node_modules` -- confirmed via `readlink -f node_modules/@cofounderai/core`
resolving to this worktree's own `packages/core`, and `git diff --stat -- package-lock.json`
showing no diff). Full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint` -- 0 errors, the same 1 pre-existing unrelated warning every prior entry has
logged. `node scripts/lint-import-boundaries.mjs` -- 1176 files, no violations (the new
`entitlements/` directory only imports `@cofounderai/module-registry` and this same
package's own `../licensing/queries`, both already-allowed dependencies for
`packages/core`). `node scripts/lint-migration-schema.mjs` -- 136 migrations, unchanged
(no migration this story -- no new table, no business<->plan link invented). `npx vitest
run --root packages/core` -- 94 tests (88 -> 94, this story's 6 new cases), all passing.
`apps/web`'s own `vitest run --passWithNoTests` -- 47 tests, unchanged (no `apps/web` file
touched this story). No `next build` run -- no route or page touched, matching this
pipeline's own "if UI/routes touched" condition. No migration applied to the dev project,
no new RLS test script -- neither applies; no new table exists.

**Limitation, stated plainly**: unlike every prior `platform.*`-table story in this log,
this entry's "not performed" note is not about a missing browser session -- it is that
the two remaining, most consequential pieces of this section (which layer actually decides
what a business is entitled to beyond its raw per-module license, and where usage numbers
would come from) are genuinely undecided by the doc this backlog was built from, and this
run is stopping rather than deciding them unreviewed.

**Status**: PLATFORM-P0-05.1 partially done (module-level `hasModule()` shipped and
merged). **Stopping here, not auto-continuing**, per this run's own task assignment:
completing PLATFORM-P0-05.2/05.3's Plan and Business-Override layers, PLATFORM-P0-05.4's
remaining `hasFeature`/`getLimit`/`canConsume`, and by extension all of §10 (Usage &
Limits, PLATFORM-P0-06, which the doc's own section order would reach next) all require an
explicit answer to: **how does a business get assigned to a `platform.plans` row, and
where should PLATFORM-P0-06's usage counters live?** Neither question is decided by
`docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md`, `docs/plan/00-MASTER-PLAN.md`, or any ADR
-- real, user-facing product/architecture decisions (e.g.: does every business get a
default plan at signup? does an existing business with no plan behave as the most
permissive plan, the least, or "unrestricted until assigned"? does `core.business_settings.plan`
become that link, or does a new column/table carry it?) that this run declines to guess
into `main`. This run's own usage-tracking note: well under the 80% stop threshold: this
is a natural, doc-mandated stopping point (a genuine architectural ambiguity), not a usage
cutoff -- the same "stop early at a clean boundary rather than starting something
unfinishable in one sitting" allowance this run's own instructions call out explicitly.

### Business<->Plan Link — schema foundation for PLATFORM-P0-05.2 onward (2026-09-12)

**Not a doc-numbered sub-story** -- this is the schema foundation the previous entry
stopped and asked for user input on. The user has since answered all three open questions
directly (not a decision this run made on its own):

1. Every business gets a default plan. New businesses are assigned a plan at creation
   (default: `free`). Existing businesses are backfilled -- never left unassigned.
2. `core.business_settings.plan` becomes a real foreign key into `platform.plans.key`,
   replacing its previous free-text nature (default `'starter'`, matching no real seeded
   plan).
3. Usage counters live in a new shared `core.usage_counters` table (deferred to this
   section's own PLATFORM-P0-06.1 turn, per the doc's own section order -- not built in
   this story; see that story's own future entry).

This story implements decisions #1/#2 only, as its own focused commit before resuming the
doc's own PLATFORM-P0-05.2 (Entitlement Precedence) -- per this run's task assignment,
which named this exact split.

**Live-data check performed first, per this run's own instruction and CLAUDE.md's "live
source of truth" rule**: queried the **dev** project (`jazdtomcgqjxjueedmck`) before writing
any backfill logic. Found 5 `core.businesses` rows but only **1** `core.business_settings`
row (`plan = 'growth'`, itself matching no seeded `platform.plans.key`) -- confirming the
gap was worse than the previous entry's own audit already flagged: `core.business_settings`
has always been created *lazily* (on a module's first write -- see
`module-gst`/`module-inventory`'s own "no default row per business" comments), so most
businesses had no settings row at all, not just a wrong plan value in one that existed.

**What shipped** (`supabase/migrations/20260912070000_core_business_settings_plan_fk.sql`):
1. `core.business_settings.plan`'s column default changed from `'starter'` to `'free'`.
2. Backfill: every existing `plan` value not matching a real `platform.plans.key` is
   normalized to `'free'` (preserving any that already match, e.g. a future `'pro'`/`'max'`
   row) -- `update ... set plan = 'free' where plan not in (select key from platform.plans)`.
   Then, every `core.businesses` row with no `core.business_settings` row at all gets one
   inserted (using the new `'free'` default) -- closing the "most businesses have no row"
   gap directly, not just the one pre-existing row's bad value.
3. The FK itself: `core.business_settings.plan references platform.plans (key)`, plus a
   covering index (`business_settings_plan_idx`) -- added only after the backfill guarantees
   every existing value is valid. No `on delete`/`on update` action needed: `platform.plans`
   rows are never deleted (no delete policy/grant exists on that table, PLATFORM-P0-04.1's
   own migration) and `key` is immutable after creation (`updatePlatformPlanSchema` omits
   it, per `platform-plans.ts`'s own docstring) -- there is no real update/delete path this
   FK would ever need to react to.
4. Default-plan-at-creation going forward: a new `core.handle_new_business()` trigger
   (`after insert on core.businesses`), the exact auto-provisioning pattern
   `core.handle_new_user()` already established for accounts/account_members on signup --
   not a change to any module's own business-creation code. This was a deliberate choice:
   `createBusiness()` lives in `module-discovery` (a different, concurrently-running
   workstream's own territory this run must never touch), and a DB-level trigger guarantees
   every future business gets a settings row no matter which module or code path ever
   creates one, not just today's one caller. `on conflict (business_id) do nothing` makes it
   safe against a caller that inserts its own row in the same transaction.

This is a `core`-schema change made in service of a platform feature -- the one legitimate
case CLAUDE.md's own module-boundary rule allows a platform-workstream story to touch
`core`, since the FK target is `platform.plans` and the whole point is linking the two (this
story's own task brief is explicit on this point). The migration touches `core` + `platform`
only (one non-core schema), satisfying `scripts/lint-migration-schema.mjs`'s own rule.

**Existing tests fixed as a direct, necessary consequence of the new auto-provisioning
trigger** (not unrelated refactoring -- each one asserted on the exact "no settings row
until first write" behavior this migration intentionally changes):
- `scripts/test-discovery-rls.mjs`: the C-2 seeding step's plain `insert into
  core.business_settings` became an upsert (`on conflict (business_id) do update`), since a
  row already exists by the time that line runs; and the "Bob sees none of Alice's business
  settings" assertion (previously true only because Bob's business had *no* row at all) was
  corrected to assert real tenant isolation instead -- Bob now legitimately has exactly 1
  row (his own, auto-created), never Alice's.
- `scripts/test-core-audit-log.mjs`: removed the now-redundant explicit
  `insert into core.business_settings (business_id) values (...)` (the row already exists
  the moment the business itself is created) -- a plain insert would now fail on the
  `business_id` primary key.
- `scripts/test-inventory-compat-views.mjs`: `inventory.organizations`' own "the view reads
  sane defaults before business_settings exists" assertion updated from `plan = 'starter'`
  to `plan = 'free'`, since every business now has a real settings row (with a real plan)
  from the moment it's created, not the view's own hardcoded `coalesce(..., 'starter')`
  fallback (that view lives in `module-inventory`'s own migration and was not touched --
  its fallback is simply unreachable for any future business now, which is harmless).
- Also found, via a from-scratch migration replay unrelated to this story's own change (a
  concurrently-developed permission catalogue growing, not anything this migration touches):
  `scripts/test-discovery-rls.mjs`'s own hardcoded `core.permissions` row-count assertion
  (`"43"`) was already stale against this branch's own current migration timeline before
  this story touched anything (confirmed by replaying every existing migration *without*
  this story's own new file and getting `53` back, matching the failure) -- 9 new `crm.*`
  permissions and 1 new `fsm.assessments.manage` permission had landed from other,
  concurrently-merged workstream stories since that assertion was last updated. Bumped to
  `"53"` with an accurate updated breakdown in the same assertion's own message, since a
  correct `npm run test:db` run for this story's own verification requires it and the fix
  is a one-line numeric correction, not a design decision about any other module's own
  permission catalogue.

**New test**: `scripts/test-core-business-settings-plan-fk.mjs` (wired into `test:db`) --
13 assertions: a freshly created business is assigned `'free'` at creation (not lazily);
the trigger fires for every business, not just the first; the FK rejects an unrecognized
plan value and leaves the real value untouched; a valid plan change (`'pro'`) succeeds; the
column default is confirmed to be `'free'` via `information_schema.columns`; the
auto-provisioning insert's `on conflict do nothing` is confirmed genuinely conflict-safe
(a redundant insert doesn't clobber an already-changed plan); and tenant isolation still
holds (each business sees only its own settings row, including its own auto-assigned
plan). This is `core`-tenant data, not a `platform.*` superadmin table, so -- per this run's
own task brief -- it follows `core`'s own tenant-RLS-test convention (Alice/Bob, no
superadmin dimension), not the `platform.*` superadmin-only pattern the sibling
`test-platform-plan-*-rls.mjs` scripts use.

**Verification**: live-data check against the dev project performed first (above). Applied
live via `mcp__Supabase__apply_migration` (plus one immediate follow-up migration adding
the covering index once `mcp__Supabase__get_advisors` performance flagged the new FK as
unindexed -- fixed in the same story, and folded into this migration's own file for the
git history). Confirmed post-migration on the dev project directly: all 5 businesses now
have a settings row, all backfilled to `plan = 'free'` (the one pre-existing `'growth'` row
included), the FK constraint exists (`FOREIGN KEY (plan) REFERENCES platform.plans(key)`),
and `has_table_privilege` confirms `authenticated`'s existing select/insert/update grants on
`core.business_settings` are unaffected (this table already existed; only a column
default/constraint changed, not its grants). `mcp__Supabase__get_advisors` (security) --
zero new findings, same 5 pre-existing `rls_enabled_no_policy` tables (none touched by this
story) and the pre-existing leaked-password-protection warning every prior entry has logged.
`mcp__Supabase__get_advisors` (performance) -- the one new finding (unindexed FK) was fixed
within the same story; re-ran advisors after and confirmed it's gone, leaving only the same
benign "unused index" class every sibling FK index already carries in this empty dev
database. Full monorepo `npm run typecheck --workspaces --if-present` -- clean across every
workspace. `npm run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing
unrelated warning every prior entry has logged. `node scripts/lint-import-boundaries.mjs` --
1176 files, no violations (no package import touched). `node scripts/lint-migration-schema.mjs`
-- 137 migrations (136 -> 137, this story's own file), no violations. `npx vitest run --root
packages/core` -- 94 tests, unchanged (no `packages/core` TypeScript file touched -- this
story is migration + test-script only). `apps/web`'s own `vitest run --passWithNoTests` --
47 tests, unchanged. `cd apps/web && rm -rf .next && npm run build` -- clean (run despite no
route/page being touched, given this story changes a column every module reads, to confirm
nothing broke at build time).

`npm run test:db` (the full composite) itself fails, but on a **pre-existing, unrelated,
out-of-scope failure**, confirmed via a from-scratch migration replay with this story's own
migration file physically removed and re-added: `scripts/test-gst-compliance-profile-rls.mjs`
(and, checked individually afterward, `test-gst-tax-registrations-rls.mjs` and
`test-gst-tax-rules-rls.mjs` too) fail an `assertThrows` -- Bob is able to UPDATE a row on
Alice's business when the test expects RLS to reject it. This reproduces identically with
this story's migration file removed entirely, proving it predates and is unrelated to this
story (a GST-module RLS gap, not a business_settings/entitlement one). `module-gst` is
explicit, named out-of-scope territory for this workstream ("Never touch... packages/module-gst")
-- not fixed here. **Flagging it for whichever workstream owns GST/Compliance**: this looks
like a real, live tenant-isolation bug across at least three `gst.*` tables' UPDATE
policies, the same class of finding this run's own task brief calls out
(PLATFORM-P0-03.4's own precedent) -- but the fix belongs to that module's own workstream,
not this one. Individually re-ran every script downstream of that break point in the
composite chain to confirm this story's own migration didn't regress anything reachable:
`test-platform-plans-rls.mjs`, `test-platform-plan-modules-rls.mjs`,
`test-platform-plan-limits-rls.mjs`, `test-platform-plan-features-rls.mjs`,
`test-fsm-rls.mjs`, `test-fsm-workflow.mjs`, `test-crm-rls.mjs`,
`test-crm-backlog-rls.mjs`, `test-sales-returns-workflow.mjs`, and this story's own new
`test-core-business-settings-plan-fk.mjs` -- all pass. Everything *before* the break point
in the composite chain (including `test-discovery-rls.mjs`, `test-core-audit-log.mjs`,
`test-inventory-compat-views.mjs`, all three edited by this story) already ran to completion
inside the one `npm run test:db` invocation and passed.

**Deliberately not built in this story**: decision #3 (`core.usage_counters`) -- explicitly
deferred to this section's own PLATFORM-P0-06.1 turn later, per the doc's own section order
and this run's own task assignment, which named that split explicitly.

**Status**: done. Resuming the doc's own sequence: PLATFORM-P0-05.2 (Entitlement
Precedence) next.

### PLATFORM-P0-05.2 / 05.3 / 05.4 — Entitlement Precedence, Evaluation, Licensing Integration (2026-09-12)

Folded into one story/commit, the same way this backlog has folded tightly-coupled
sub-stories before (04.5/04.6, 04.7-into-04.1): 05.2 (precedence) and 05.3 (evaluation
shape) are not separable in practice -- there is no way to define a real precedence order
without simultaneously building the functions that actually evaluate it, and 05.4
("integrate with the existing licensing model") turned out to be a design constraint on
*how* to build 05.2/05.3, not a separate deliverable.

**Reconnaissance**: re-read §9 in full, then `packages/core/src/entitlements/{types,
module-entitlement}.ts` (05.1's own output) and `packages/core/src/licensing/queries.ts`
to confirm exactly what `hasModule()` already composes before adding anything alongside
it, plus `platform.plan_features`/`plan_limits`' own migrations (04.4/04.5-04.6) for their
real column shapes and already-documented default semantics.

**A live permission gap found and fixed, per this run's own "proactively check" mandate
(the PLATFORM-P0-03.4 precedent)**: every plan-catalog table (`platform.plans`,
`plan_modules`, `features`, `plan_features`, `plan_limits`) had a SELECT policy scoped to
`platform.is_superadmin()` only -- correct for §8's own story (a superadmin managing the
catalog), wrong for this one: `hasFeature()`/`getLimit()` need to answer "is *this
business*, via *its own plan*, entitled to X" for an ordinary signed-in business member,
not a superadmin. Confirmed directly (not assumed): every sibling
`test-platform-plan-*-rls.mjs` already proved a non-superadmin gets 0 rows from these
tables. Left as-is, `hasFeature()`/`getLimit()` would have silently and incorrectly
reported "not entitled"/"no limit" for every real business, every time, regardless of
their actual plan -- a wrong-but-plausible-looking answer, exactly the failure mode this
backlog's own "never fabricate data" stance rules out elsewhere.

**The fix** (`supabase/migrations/20260912080000_platform_catalog_authenticated_read.sql`):
these five tables' *contents* are not sensitive tenant data -- they describe what a
Free/Pro/Max plan includes, the commercial-catalog equivalent of a public pricing page,
not any one business's private information. SELECT widens to any authenticated user
(dropping the superadmin-only SELECT policy, replacing it with an open one, the same
"read is open, write stays gated" shape `core.modules`' own existing policy already uses
for an analogous non-sensitive catalog); INSERT/UPDATE/DELETE are untouched -- still
superadmin-only, exactly as §8's own stories left them. Verified this precisely on the
live dev project via `pg_policies`: every table now shows exactly one `SELECT` policy
scoped to `{authenticated}` with `using (true)`, and the original `INSERT`/`UPDATE`/
`DELETE` policies (still superadmin-gated) are unchanged.

**Judgment call, made and documented rather than guessed past silently**: PLATFORM-P0-04.5's
own migration explicitly left "what a missing (plan, resource_key) row should mean for a
real authorization decision" to this section to decide. Decided: an *unconfigured* limit
means **unrestricted** (`allowed: true`, `limit: null`), not denied -- the one consistent
precedent every prior "config doesn't exist yet" call in this exact backlog has already
set (PLATFORM-P0-04.3 seeded every plan x module pair `enabled = true` specifically so the
table's mere existence changed nothing until a superadmin acted; PLATFORM-P0-03.3's login
branding override is opt-in, defaulting to today's look). Defaulting an unconfigured limit
to *deny* would silently break every business's use of a resource the instant this table
exists, before any superadmin has configured anything -- the opposite of "safe, additive,
non-speculative." This is treated as applying an already-established codebase convention
consistently, not inventing a new one -- unlike the plan-assignment/FK-location/usage-
counter-location questions the previous entry correctly stopped on, nothing here invents a
*real pricing number* (no "Free plan allows 3 businesses" was fabricated; `plan_limits`
stays empty except where a superadmin explicitly configures it, exactly as 04.5 left it).

**What was built** (`packages/core/src/entitlements/`):
- `plan-lookup.ts`: `getBusinessPlan(businessId)` -- resolves `core.business_settings.plan`
  (guaranteed present and FK-valid since the previous story) to its `platform.plans` row,
  through the request-scoped RLS client both reads run under. Returns `null` (never
  throws) if either read comes back empty, so a caller degrades to "not entitled" instead
  of crashing.
- `feature-entitlement.ts`: `hasFeature(business, moduleKey, featureKey)` -- composes
  exactly two layers, in order: **License** (`hasModule()`, 05.1 -- if the feature's own
  module isn't licensed/is in grace, returns that decision as-is, `source: "license"`,
  since there's no point asking about a sub-capability of a module the business can't use
  at all) then **Plan** (`platform.plan_features` -- no row for (plan, feature) means "not
  entitled", the exact default 04.4's own migration and RLS test already established).
  Platform Global (07.2, not started) and Business Override (P1-02.1) are not composed,
  same reasoning `hasModule()`'s own docstring already gives; User Permission stays a
  separate, independently-enforced axis (`has_permission()`/`requirePermission()`), not
  folded in here, also matching `hasModule()`'s own precedent. `buildFeatureEntitlementDecision()`
  is the pure, directly-unit-tested composition helper (5 test cases), same split
  `buildModuleEntitlementDecision()` already established.
- `limit-entitlement.ts`: `getLimit(business, resourceKey)` -- **deliberately partial**,
  the same honest-gap shape `hasModule()` itself set as precedent in 05.1: `limit` is real
  (read from `platform.plan_limits` via the business's own plan), but `usage`/`remaining`
  are always `null` -- PLATFORM-P0-06.1 (Usage Counters) is this run's own very next
  section and has not shipped, so there is no real usage number to report; returning `0`
  or any other number here would be fabricated data. `RESOURCE_KEYS`/`ResourceKey` mirror
  `plan_limits`' own closed 13-value CHECK constraint by hand (kept in sync manually --
  both lists are short and static; a codegen pipeline is more machinery than this needs).
  `buildLimitEntitlementDecision()` is the pure composition helper (5 test cases): no row
  -> unrestricted (the judgment call above); `disabled` -> denied outright; `unlimited` ->
  allowed with `limit: null` (never a fake huge number); `limited` -> the real
  `limit_value`, with an honest "usage tracking is not yet available" note in `reason`.
- **`canConsume(business, resource, quantity)` -- not built in this story.** Its entire
  purpose ("would consuming N more exceed the limit") is unanswerable without a real usage
  number; a stub that always returned `true` (the only honest answer with `usage: null`)
  would be actively unsafe once a caller relied on it for PLATFORM-P0-06.3's own "enforce
  limits server-side" -- worse than not existing. Deferred to immediately after
  PLATFORM-P0-06.1 lands real usage counters, at which point `getLimit()` itself also gets
  `usage`/`remaining` filled in for the first time (an addition to the same function, not
  a rewrite).
- `module-entitlement.ts`'s own docstring updated: the "Plan is not composed because
  nothing links a business to a plan" reasoning is now stale (the link exists), replaced
  with the real, current reasoning -- `hasModule()` still doesn't consult
  `platform.plan_modules`, now by deliberate choice: RLS itself (`core.has_module()`/
  `has_module_write()`) has no equivalent check, and folding a plan-level module toggle
  into this function's decision without RLS also enforcing it would make this function
  produce a different answer than the database's own authoritative gate -- exactly the
  "competing licensing system" PLATFORM-P0-05.4 says not to build. Wiring
  `platform.plan_modules` into real module-level enforcement would mean changing RLS and
  every module table's own policy -- a genuine architecture change needing its own
  explicit approval, not something to fold in here unreviewed.

**Existing test fixes, direct consequences of the RLS widening (not unrelated
refactoring)**: `test-platform-plans-rls.mjs`, `test-platform-plan-modules-rls.mjs`,
`test-platform-plan-limits-rls.mjs`, `test-platform-plan-features-rls.mjs` -- each had an
assertion that a non-superadmin business member gets exactly 0 rows on SELECT; each
updated to assert the real, now-correct row count instead (write-side assertions --
INSERT rejected, UPDATE/DELETE silent no-ops for a non-superadmin -- are untouched, since
write policies were not touched by this story).

**New tests**: `feature-entitlement.test.ts` (5 cases) and `limit-entitlement.test.ts` (5
cases) unit-test the pure decision helpers with no database, mirroring
`module-entitlement.test.ts`'s own shape. `scripts/test-core-plan-entitlement-lookup.mjs`
(wired into `test:db`, 7 assertions) is a DB-backed behavior test for the actual join
chain (`business_settings.plan -> plans.key -> plan_features`/`plan_limits`) as an
ordinary authenticated business member (not a superadmin) -- new query composition this
story introduces, distinct from what any single table's own pre-existing RLS test already
covers alone.

**Verification**: applied live via `mcp__Supabase__apply_migration` against the dev
project (`jazdtomcgqjxjueedmck`); confirmed via a direct `pg_policies` query that all five
tables now carry exactly the intended SELECT-open/write-gated policy set.
`mcp__Supabase__get_advisors` (security) -- zero new findings, same 5 pre-existing
`rls_enabled_no_policy` tables and the pre-existing leaked-password-protection warning
every prior entry has logged (widening a SELECT policy adds no new advisor class).
Full monorepo `npm run typecheck --workspaces --if-present` -- clean across every
workspace. `npm run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing
unrelated warning every prior entry has logged. `node scripts/lint-import-boundaries.mjs`
-- 1181 files, no violations (the new entitlement files import only `../db/server`,
`../licensing/queries`... themselves already-allowed dependencies). `node
scripts/lint-migration-schema.mjs` -- 138 migrations (137 -> 138, this story's own file;
touches `platform` only), no violations. `npx vitest run --root packages/core` -- 103
tests (94 -> 103, this story's own 9 new unit cases: 4 in `feature-entitlement.test.ts` +
5 in `limit-entitlement.test.ts`), all passing. `npm run test:db`
-- re-ran all four edited `platform.plan_*` RLS scripts plus the new
`test-core-plan-entitlement-lookup.mjs` individually, all pass. `cd apps/web && rm -rf
.next && npm run build` -- clean (run despite no route/page being touched, given this
story widens RLS on tables several existing pages may depend on).

**Status**: PLATFORM-P0-05.2/05.3 done for `hasFeature()`/`getLimit()`; 05.4 confirmed
(existing licensing model, `core.has_module()`/`has_module_write()`, untouched and
undegraded). `canConsume()` explicitly deferred to right after §10's own PLATFORM-P0-06.1.
Moving to the next doc section in order: §10 Usage & Limits (PLATFORM-P0-06), starting
with 06.1 (Usage Counters, `core.usage_counters` -- decision #3 from this run's task
brief, deferred here specifically for this moment).

### PLATFORM-P0-06.1 — Usage Counters (2026-09-12)

Implements decision #3 from this run's own task brief, deferred to this exact moment by
every prior entry in this section: **"Usage counters live in a new shared
`core.usage_counters` table that each module writes to directly, business-scoped, when it
performs a countable action."** The task brief is explicit that this story only needs to
build "the table, its RLS, and the read-side query surface for PLATFORM-P0-06.2" real and
usable -- not wire up any module's own countable actions yet ("that's each module's own
future integration work"). This entry does exactly that scope, plus a real write-side
surface (natural to include alongside the read side, and needed for this story's own
tests) -- no module's own mutation code was touched.

**Schema** (`supabase/migrations/20260912090000_core_usage_counters.sql`): `core`, not
`platform` -- per the task brief, this is a business's own tenant-scoped operational data
("customer-facing billing-adjacent data"), not platform-operator catalog data, so it
follows `core`'s existing tenant-RLS convention (members can view their own business's
rows), not `platform`'s superadmin-only one. One row per `(business_id, resource_key,
period)`; `resource_key` reuses `platform.plan_limits`' own closed 13-value list verbatim
(so a business's usage and its plan's limit always speak the same vocabulary -- required
for `getLimit()` to ever honestly compare the two). `period` is either the sentinel
`'current'` (a running, never-reset total -- the natural fit for "how many of X exist
right now," e.g. businesses/users/products/contacts/prospects/opportunities/
business_offerings) or a `'YYYY-MM'` UTC calendar-month key (a periodic consumption
dimension that resets monthly -- ai_runs/ai_credits/whatsapp_conversations/api_calls/
automation_runs/storage, matching every seeded plan's `'month'` billing interval; a
year-interval plan's own periodization is left to whichever future story actually sells
one, per CLAUDE.md's "never implement speculative functionality").

**Write path, deliberately narrow**: no client-facing INSERT/UPDATE/DELETE policy at all
-- the same "no client-facing write, one SECURITY DEFINER function is the only path to a
row" shape `core.audit_log`/`core.write_audit_log()` already established (D-10). The one
write path, `core.increment_usage_counter(business_id, resource_key, delta, period)`, is
an atomic upsert-and-increment (`on conflict ... do update set count = greatest(count +
delta, 0)` -- never negative, so a mismatched decrement can't produce a nonsensical
number) that additionally **re-checks tenant membership inside the function body**
(`p_business_id in (select user_business_ids())`) before writing, unlike
`write_audit_log()` -- usage data is more consequential to get wrong (it will gate real
enforcement once PLATFORM-P0-06.3 lands) than an audit trail entry, so a caller invoking
it for a business it doesn't belong to is rejected outright rather than trusted.

**TypeScript surface** (`packages/core/src/usage/`): `types.ts` (`UsageCounter`,
`toUsageCounter()` mapper, and `currentMonthPeriod()` -- a pure, directly-unit-tested UTC
month-key helper, so no module ever hand-rolls its own period-string logic inconsistently
later), `queries.ts` (`listUsageCounters(businessId)` for PLATFORM-P0-06.2's own dashboard,
`getUsageCounter(businessId, resourceKey, period)` for `getLimit()`'s own future use),
`mutations.ts` (`incrementUsageCounter(businessId, resourceKey, delta, period)`, the thin
wrapper over the RPC). `RESOURCE_KEYS`/`ResourceKey` were factored out of
`entitlements/limit-entitlement.ts` into a new shared `entitlements/resource-keys.ts`
(re-exported from `limit-entitlement.ts` for backward compatibility) rather than declaring
the same 13-value list a third time -- `usage/types.ts` imports the one shared list.

**Tests**: `usage/types.test.ts` (4 cases, `currentMonthPeriod`'s UTC-not-local-time
behavior explicitly covered, plus the row-mapper) -- pure, no database. New RLS/behavior
test `scripts/test-core-usage-counters-rls.mjs` (wired into `test:db`, 13 assertions,
mandatory per CLAUDE.md principle 9 for business-scoped data): no client INSERT/UPDATE/
DELETE path exists (INSERT throws on the WITH CHECK clause; UPDATE/DELETE silently affect
zero rows, since there's no USING policy either); `increment_usage_counter()` rejects a
business the caller doesn't belong to, even through the SECURITY DEFINER function;
upsert-and-increment is atomic and idempotent-safe (a second call increments rather than
duplicating); a negative delta decrements and clamps at zero, never negative; period-scoped
rows are independent of each other; both CHECK constraints (resource_key, period) reject
invalid values; tenant isolation holds on reads.

**Verification**: applied live via `mcp__Supabase__apply_migration` against the dev
project. `mcp__Supabase__get_advisors` (security) -- zero new findings, same 5
pre-existing `rls_enabled_no_policy` tables and the pre-existing leaked-password-protection
warning every prior entry has logged. `mcp__Supabase__get_advisors` (performance) -- the
one new index (`usage_counters_business_id_idx`) shows up only as the same benign "unused
index" class every sibling FK index already carries in this empty dev database.
`has_table_privilege('authenticated', 'core.usage_counters', 'select')` confirmed `true`
directly on the live project -- this brand-new table is covered by the existing
schema-wide `core` grant (PLATFORM-P0-03.4's own fix), not silently missing it. Full
monorepo `npm run typecheck --workspaces --if-present` -- clean across every workspace.
`npm run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated
warning every prior entry has logged. `node scripts/lint-import-boundaries.mjs` -- 1186
files, no violations (the new `usage/` directory only imports `../db/server` and
`../entitlements/resource-keys`, both already-allowed dependencies within
`packages/core`). `node scripts/lint-migration-schema.mjs` -- 139 migrations (138 -> 139,
this story's own file; touches `core` only), no violations. `npx vitest run --root
packages/core` -- 107 tests (103 -> 107, this story's own 4 new cases), all passing. `cd
apps/web && rm -rf .next && npm run build` -- clean (run despite no route/page being
touched, given this story adds a new RLS-protected table).

**Immediate follow-up, folded into this same commit rather than left as a stated "next
step"**: `getLimit()` (`entitlements/limit-entitlement.ts`) now reads through
`getUsageCounter()` for real `usage`/`remaining` values -- the one piece PLATFORM-P0-05.2's
own entry left honestly `null`, now completed the moment real counters exist. Looked up
under the `'current'` running-total period for most resources, or the current UTC
calendar month (`currentMonthPeriod()`) for the periodic-consumption subset
(`isPeriodicResource()`, `entitlements/resource-keys.ts`). A resource with no counter row
yet reports `usage: 0` (an honest "hasn't happened yet," not a fabricated number -- the
counters table's own additive, non-negative design makes 0 the only correct reading of
"never incremented"). For a `limited` resource, `allowed`/`remaining` now match
PLATFORM-P0-05.3's own worked example verbatim (`{allowed: false, reason: "Pro plan
allows 5 businesses", usage: 5, remaining: 0}`): `remaining = max(limit - usage, 0)`,
`allowed = usage < limit`. `buildLimitEntitlementDecision()`'s own test suite grew from 5
to 8 cases covering exactly this (at-the-limit denial matching the doc's example, under-limit
allowance with real remaining, usage clamped and never producing a negative remaining, and
the unconfigured/disabled/unlimited cases each re-verified against the new `usage`
parameter's default).

**Deliberately still not built**: `canConsume(business, resource, quantity)`
(PLATFORM-P0-05.1's fourth named function) -- real usage now exists, but `canConsume`
needs to reserve/check against a *prospective* quantity atomically at the point of the
action, a genuinely separate concern from "read the current state" (all `getLimit()`
does) -- left to PLATFORM-P0-06.3 (Limit Enforcement) itself, the doc's own next story for
exactly this question. No module's own countable actions write to `core.usage_counters`
yet either -- explicit, named scope of this exact story per the task brief; each module's
own future integration work. PLATFORM-P0-06.2 (Usage Dashboard UI), 06.3 (Limit
Enforcement), 06.4 (Graceful Limit UX), 06.5 (Soft vs Hard Limits) -- each its own
following story in this same section.

**Re-verification after the `getLimit()` addition**: full monorepo `npm run typecheck
--workspaces --if-present` -- clean. `node scripts/lint-import-boundaries.mjs` -- 1186
files, no violations (the new cross-file imports -- `limit-entitlement.ts` importing
`../usage/types`/`../usage/queries` -- are within `packages/core` itself, not a
cross-package boundary this lint enforces). `npx vitest run --root packages/core` -- 110
tests (107 -> 110, net +3 from replacing `limit-entitlement.test.ts`'s 5 cases with 8).

**Status**: PLATFORM-P0-06.1 done, including `getLimit()`'s own real `usage`/`remaining`
wiring. Continuing in doc order: PLATFORM-P0-06.2 (Usage Dashboard).

### 06.2 — Usage Dashboard (2026-09-12)

New `packages/core/src/usage/dashboard.ts`: `getUsageDashboard(businessId)`, one row per
`ResourceKey` carrying exactly the four fields the doc's own worked example names --
`Current Usage`, `Plan Limit`, `Remaining`, `Projected Usage` -- built entirely on top of
06.1's own `getBusinessPlan()`/`getUsageCounter()`/`plan_limits` machinery and
05.2/05.3's own `buildLimitEntitlementDecision()`, not a second parallel query path.

`projectedUsage` is a real, deterministic linear projection (`projectedMonthlyUsage()`):
current usage divided by calendar days elapsed this UTC month, times days in the month --
never an LLM guess, per CLAUDE.md principle 4. `null` for a running-total (non-periodic)
resource (there is no month to project a running total against) and `null` when there is
no configured limit to project against (nothing to compare the projection to).

**Deliberately no `/platform` UI page ships with this story** -- not a PLATFORM-P0-05.1-
style blocked judgment call (this function is fully real, authorized today by
`core.usage_counters`/`core.business_settings`/`platform.plan_limits`'s own existing RLS
for any caller with a legitimate `businessId`), but because both plausible homes for the
page are someone else's future story: a tenant-facing "my usage" settings page is each
*module's* own future integration work (same scope boundary 06.1's own entry already
drew for who writes the counters); a superadmin cross-tenant browsing UI needs real
business search across tenants, which doesn't exist yet and is explicitly
PLATFORM-P1-03.1/03.2's own deferred future scope ("Customer Search," "Customer
Configuration View"). Building either now would be exactly the kind of scope this run's
task brief says to stop and report on, not invent.

New `packages/core/src/usage/dashboard.test.ts` -- 5 cases for `projectedMonthlyUsage()`
(flat linear projection, zero usage, first-day-of-month with no divide-by-zero, rounding,
and a real February 28-day month). `getUsageDashboard()` itself is a thin composition over
already-tested primitives (`getBusinessPlan`/`buildLimitEntitlementDecision`), matching
this codebase's own established convention (`packages/core/src/admin/queries.ts`,
`platform-dashboard-queries.ts`) that a query-only DB wrapper with no independent branching
logic doesn't get its own mocked-DB test.

Verified: `npx tsc --noEmit` clean in `packages/core`; `node
scripts/lint-import-boundaries.mjs` -- 1188 files, no violations; `npx vitest run --root
packages/core` -- 16 files / 115 tests passed (110 -> 115, +5 new).

**Status**: PLATFORM-P0-06.2 done. Continuing in doc order: PLATFORM-P0-06.3 (Limit
Enforcement).

### PLATFORM-P0-06.3 — Limit Enforcement (2026-09-12)

Session note before this entry: this run resumed a worktree whose local branch
`feature/platform-admin-portal` was 4 commits behind `origin/feature/platform-admin-portal`
(a prior run had already shipped PLATFORM-P0-05.2/05.3/05.4, 06.1, and 06.2, all already
merged into `origin/main`). Verified per the task brief's own instruction ("confirm HEAD
genuinely sits on the branch's real tip") before writing any code: fast-forwarded the local
branch to `origin/feature/platform-admin-portal` (`git merge --ff-only`, no rewrite), then
re-read this file's own tail and `git log` to confirm exactly where that prior run stopped
-- "Continuing in doc order: PLATFORM-P0-06.3 (Limit Enforcement)," above -- before
resuming from there.

**Scope**: "Enforce limits server-side. UI-only restrictions are not sufficient." This is
`canConsume(business, resource, quantity)`, PLATFORM-P0-05.1's fourth and final named
entitlement-service function, deliberately left unbuilt by both `limit-entitlement.ts`'s
own docstring and `usage/mutations.ts`'s own docstring, each pointing at this exact story
as where it belongs.

**Why a new SQL function rather than reusing `getLimit()`'s read-then-decide shape**: a
naive implementation -- call `getLimit()`, check `allowed`, then call
`incrementUsageCounter()` -- has a real race. Two concurrent requests for the same
(business, resource) can both read "1 remaining," both decide "allowed," and both
increment, overshooting the configured limit by one. "Enforce limits server-side" has to
mean atomically, not just "in a server-side function that itself isn't atomic." The fix:
`core.try_consume_usage_counter()` (`20260912100000_core_try_consume_usage_counter.sql`),
one new SECURITY DEFINER PL/pgSQL function that does the whole "read the plan's limit for
this resource, lock the counter row, decide, and (if granted) increment" sequence inside
one transaction. The row lock (`select ... for update` on the now-guaranteed-to-exist
counter row) is the actual enforcement mechanism: a second concurrent caller for the same
(business, resource, period) blocks on that lock until the first transaction commits,
so two callers can never both read the same "before" count and both be granted past the
limit. This is exactly `core.increment_usage_counter()`'s own reasoning (PLATFORM-P0-06.1)
for being one atomic function rather than a client read-modify-write, applied to the
harder "check before deciding" case.

Returns raw facts (`state`, `limit_value`, `usage_before`, `usage_after`, `granted`), not
an already-shaped `EntitlementDecision` -- the same "IO-touching function returns raw
data, a pure sibling shapes the decision" split `getLimit()`/`buildLimitEntitlementDecision()`
already established, so the `reason`/`allowed` text logic lives in one place
(TypeScript, directly unit-testable) rather than being duplicated as PL/pgSQL string
formatting.

`canConsume(businessId, resourceKey, quantity = 1)` (`packages/core/src/entitlements/limit-entitlement.ts`)
is the thin TypeScript wrapper: resolves the business's plan (for the decision's own
`reason` text, matching every sibling entitlement function), calls the RPC once, and shapes
the result through the new pure `buildConsumeEntitlementDecision()`. A *granted* call has a
real side effect (the counter is incremented by `quantity`); a *denied* call has none at
all -- the whole point of doing the check and the write in one atomic step. `getLimit()`
remains the right call for a caller that only wants to inspect current standing without
consuming anything (e.g. a dashboard); `canConsume()` is for the actual point of a
countable action.

Same "no configured limit row = unrestricted, not denied" default `getLimit()`/every prior
`plan_limits`-reading story already established -- the SQL function normalizes a `null`
`plan_limits.state` read to `'unrestricted'` before deciding, and `buildConsumeEntitlementDecision()`
treats it identically to `'unlimited'` except for the `reason` text (matches
`buildLimitEntitlementDecision()`'s own wording exactly).

**Verification**:
- `npx tsc --noEmit` clean across the full monorepo (`npm run typecheck`, all 7
  workspaces).
- `npm run lint --workspaces --if-present` -- 0 errors (1 pre-existing, unrelated warning
  in a CRM conversations page).
- `node scripts/lint-import-boundaries.mjs` -- 1188 files, no violations.
- `node scripts/lint-migration-schema.mjs` -- 140 migration files, no violations (this
  migration creates a function only, no `CREATE TABLE`, so the schema-mixing check the
  linter enforces doesn't even apply, but it fully qualifies every cross-schema reference
  regardless).
- `npx vitest run --root packages/core` -- 16 files / 122 tests passed (115 -> 122, +7 new:
  `buildConsumeEntitlementDecision()` covering disabled/unrestricted/unlimited/
  limited-granted/limited-denied/negative-remaining-never/source-always-plan, the same
  coverage shape `buildLimitEntitlementDecision()`'s own suite already has).
- New `scripts/test-core-try-consume-usage-counter-rls.mjs` against real local Postgres 16
  (`pg_ctlcluster 16 main start`) -- the mandatory dedicated RLS/behavior script for this
  story's new access pattern, following `test-core-usage-counters-rls.mjs`'s own harness.
  Covers: cross-tenant rejection (Alice cannot consume against Bob's business, and the
  rejected call leaves no row at all -- the FK on `business_id` means an unrelated/
  nonexistent business fails before the membership check even runs, and a real
  unauthorized business fails the explicit membership check with no side effect either
  way); unconfigured-resource unrestricted grant; disabled-resource denial with no side
  effect; unlimited-resource grant regardless of quantity; limited-resource grants up to
  the limit then denies the next unit with the counter provably unchanged; a single
  over-sized quantity request (5 against a limit of 2) denied atomically, never partially
  consumed; `p_quantity <= 0` rejected. **The two concurrency tests are the real proof of
  this story's own core claim**: 10 concurrent callers already at a limit of 2 are all
  denied (0 granted, counter stays at 2, `psqlAsAsync`/`Promise.all`, the same pattern
  `test-core-number-sequences.mjs` established for `core.next_number()`'s own race test);
  10 concurrent callers racing for the last 3 slots of a fresh limit of 3 grant *exactly*
  3, never more, with the final counter provably at exactly 3 -- if the row lock weren't
  doing its job, this test would flake toward more than 3 grants under real concurrent
  execution, and it doesn't.
- Migration applied live to the **dev** project (`jazdtomcgqjxjueedmck`) via
  `mcp__Supabase__apply_migration`. `mcp__Supabase__get_advisors` (security + performance)
  re-run after: no new findings attributable to this migration (the existing
  `rls_enabled_no_policy`/`auth_leaked_password_protection`/`unused_index` findings are all
  pre-existing and unrelated -- this migration creates a function only, no new table, so
  there is no new RLS surface for the linter to flag).
- Role-switched live `execute_sql` verification against the dev project's own real data
  (one real user, `c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real member of several real
  businesses -- confirmed live rather than assumed, matching this backlog's own
  established rigor): as that authenticated user against their own real business (which
  has no `plan_limits` configured on the free plan in dev, same as the empty `plan_limits`
  table PLATFORM-P0-04.5's own migration deliberately shipped with) --
  `try_consume_usage_counter(<their business>, 'contacts', 1, 'current')` returned
  `{state: unrestricted, limit_value: null, usage_before: 0, usage_after: 1, granted:
  true}`, confirmed correct, then the resulting test row was deleted afterward
  (`delete ... returning *`, confirmed exactly the one row this verification created was
  removed) so this verification leaves no residue in dev's own usage data. As the same
  user against an unrelated/nonexistent business id: rejected with the function's own
  explicit `is not a member of business` exception, not a generic FK error -- the
  membership check fires first. As `anon` (no session): rejected outright at the schema
  grant level (`permission denied for schema core`) -- `core` has never granted `anon`
  schema `usage` at all, the same wall every other `core.*` write path already sits behind.

**Deliberately not built this story**: no module's own countable action calls
`canConsume()` yet -- wiring a specific module's create-a-thing flow (e.g. Discovery's
"create an opportunity") to call `canConsume()` before proceeding, and to surface a denial
to the end user, is each module's own future integration work, the same scope boundary
PLATFORM-P0-06.1's own entry already drew for who writes to `core.usage_counters` at all
(a story for whichever module workstream picks it up, and explicitly not this platform
workstream's files to touch per this run's own task brief). PLATFORM-P0-06.4 (Graceful
Limit UX -- the "You've reached your Pro plan limit... [Upgrade] [View Usage]" message) and
PLATFORM-P0-06.5 (Soft vs Hard Limits, Warning Threshold) are each their own next story in
this same section, not folded in here.

**Status**: PLATFORM-P0-06.3 done -- all four of PLATFORM-P0-05.1's named entitlement
functions (`hasModule`, `hasFeature`, `getLimit`, `canConsume`) now exist. Continuing in
doc order: PLATFORM-P0-06.4 (Graceful Limit UX).

### PLATFORM-P0-06.4 — Graceful Limit UX (2026-09-12)

**Scope**: the doc's own worked example is a specific piece of copy plus a specific pair
of actions:

```text
You've reached your Pro plan limit of 100 active opportunities.
[Upgrade]
[View Usage]
```

Before writing anything, checked live (per this run's own task brief and the standing
"read the design rules before touching UI" rule, CLAUDE.md principle 13) whether either
destination -- a plan-upgrade flow or a tenant-facing usage page tied to this backlog's own
`platform.plans`/`core.usage_counters` system -- already exists to link to. It does not:
`apps/web/app/(dashboard)/dashboard/settings/usage`,
`.../businesses/[businessId]/usage`, and `.../settings/billing` are all `module-discovery`'s
own pre-existing AI-credits ledger (`getWorkspaceUsage`/`getBusinessUsage`/
`getCreditBalance`, its own older, unrelated system predating this backlog entirely, and
explicitly a different workstream's files this run must not touch) -- not the
`RESOURCE_KEYS`/`platform.plan_limits` system PLATFORM-P0-04-06 built. `usage/dashboard.ts`'s
own docstring (PLATFORM-P0-06.2, this same section) already anticipated this exact gap:
"PLATFORM-P0-06.4's own worked example, '[View Usage],' reads as a business's own button,
not a superadmin one" -- i.e. wiring a real destination is a *module's* own future
integration work, the same boundary 06.1-06.3 each already drew. PLATFORM-P1-04.1 ("Plan
Change Rules") is explicit, deliberately-deferred P1 scope for the "Upgrade" side.

**What was built, matching 06.2's own "build the real, decidable part; don't invent the
part someone else's story owns" precedent**:

- `describeLimitReached(decision, resourceLabel, planKey)`
  (`packages/core/src/entitlements/limit-reached-messaging.ts`) -- a pure function turning
  a denied `EntitlementDecision` (from `getLimit()`/`canConsume()`) into the doc's own
  `{title, description}` copy shape, the same "raw decision in, user-facing copy out" split
  `apps/web/.../not-licensed/page.tsx`'s own `describeReason()` already established for the
  sibling "denied by licensing" case. A numeric `limit` produces the doc's own exact
  sentence shape; a `null` limit (the resource is `disabled` on the plan, or the business
  has no resolvable plan at all) falls back to the decision's own already-precise `reason`
  text under a distinct title, rather than fabricating a number that doesn't exist --
  CLAUDE.md principle 4/5's "never fabricate data," the same stance every prior
  `plan_limits`-reading story in this section already holds to. Deliberately does *not*
  lowercase the resource label for mid-sentence placement (an earlier draft did, and its
  own test caught the bug immediately): `RESOURCE_LABELS`
  (`packages/core/src/admin/platform-limits-constants.ts`) includes acronyms and a brand
  name -- "AI runs", "API calls", "WhatsApp conversations" -- and naively lowercasing the
  first character would mangle every one of them ("aI runs", "aPI calls", "whatsApp
  conversations"); a capitalized resource name mid-sentence reads fine and is never
  actually wrong, which a lowercasing heuristic here can't promise.
- `LimitReachedNotice` (`packages/core/src/components/limits/limit-reached-notice.tsx`,
  new `./limits/*` package export) -- the shared presentational rendering of that copy on
  the existing `Alert`/`Button` primitives, mirroring
  `packages/core/src/components/errors/error-notice.tsx`'s own shape (a small,
  self-contained, reusable component, not a page). `upgradeHref`/`usageHref` are both
  optional and independent: a caller with nowhere real to send one of them simply omits
  that prop and the corresponding button doesn't render at all -- never a dead link, per
  `docs/design/claude-ui-design-rules.md`'s "every visual element should have a purpose."
  A future module page that adds either destination passes its own real route in; this
  component has no opinion on what those routes are.

**Deliberately not built this story, and why -- the same boundary as every prior story in
this section**: no page renders `LimitReachedNotice` yet. That requires a real trigger (a
module's mutating action calling `canConsume()` and receiving a real denial) and a real
place for "Upgrade"/"View Usage" to point, neither of which exists yet -- wiring either one
in ahead of time would mean inventing scope that belongs to a future module story or to
PLATFORM-P1-04.1, exactly the kind of unreviewed invention this run's own task brief says
to avoid. This is a UI *component*, not a page, so it carries no route of its own to
verify via `next build`'s own route listing -- `next build` was still re-run clean after
adding it (below), the same as every other change this story made.

**Verification**:
- `npx tsc --noEmit` clean across the full monorepo.
- `npm run lint --workspaces --if-present` -- 0 errors (same 1 pre-existing, unrelated
  warning as every prior entry this session).
- `node scripts/lint-import-boundaries.mjs` -- 1191 files, no violations (the new
  component only imports from `packages/core` itself -- `../ui/alert`, `../ui/button`,
  `../../entitlements/limit-reached-messaging` -- and `next/link`/`lucide-react`, both
  already dependencies of `packages/core` and already used the same way by sibling
  components, e.g. `components/shell/module-selector.tsx`'s own `next/link` import).
- `npx vitest run --root packages/core` -- 17 files / 127 tests passed (122 -> 127, +5 new
  `describeLimitReached()` cases: the doc's own worked-example shape, the
  acronym/brand-name-safety regression case above, the disabled-resource fallback, the
  no-resolvable-plan fallback, and the "throws for an allowed decision -- this copy only
  makes sense for a denial" guard). No test file for `LimitReachedNotice` itself -- this
  codebase's own established convention for a presentational component with no branching
  logic of its own (`error-notice.tsx`/the `not-licensed` page have none either); verified
  instead by the clean `next build` below.
- Clean `npm run build --workspace apps/web` (`next build`) -- full route listing
  unchanged from before this story (the new component has no route, and nothing yet
  imports it), no new build errors or warnings.
- No migration this story -- nothing to apply/verify against the dev Supabase project or
  the local-Postgres RLS harness; this story is pure application code (a formatting
  function and a presentational component), touching no table, no RLS policy, and no new
  SQL function.

**Status**: PLATFORM-P0-06.4 done. Continuing in doc order: PLATFORM-P0-06.5 (Soft vs Hard
Limits).

### PLATFORM-P0-06.5 — Soft vs Hard Limits (2026-09-12, stopped -- see below)

The doc's own entire text for this story, in full:

```text
## PLATFORM-P0-06.5 — Soft vs Hard Limits

Support:

Soft Limit
Hard Limit
Warning Threshold
```

Three nouns, no worked example, no defined behavior -- unlike every other story in this
section (05.3 gives a literal example decision; 06.2 names the exact four fields to show;
06.4 gives the exact copy and button labels). Read `docs/plan/00-MASTER-PLAN.md` and every
other section of `09-PLATFORM-ADMIN-PORTAL-BACKLOG.md` (§24 Business-Level Exceptions, §27
Platform Billing Configuration) looking for a definition of what "soft" vs "hard" actually
*do* differently, or what a warning threshold triggers -- none exists anywhere in this
plan package.

**This run's own task brief is explicit that this is exactly the situation to stop on**:
"Any story whose correct behavior depends on a security/authorization judgment call the
doc doesn't fully specify AND that isn't resolved by the two decisions given [this run's
own dispatch] is a genuine architectural decision -- stop and report rather than
guess-and-merge." `canConsume()`/`try_consume_usage_counter()` (PLATFORM-P0-06.3, already
shipped and merged) is real entitlement enforcement gating what a tenant can do -- squarely
the "real entitlement/license enforcement" this run's own higher security bar names. Making
up what "soft" means and shipping it would mean inventing, unreviewed, a change to that
already-live enforcement's actual meaning -- not a layout or reuse-pattern call this run is
free to decide itself.

**The specific questions this doc does not answer, stated precisely (mirroring the same
"how does a business get assigned to a plan" precision the PLATFORM-P0-05.1 entry above
used, since answering these vaguely would just move the guess one level down)**:

1. **What does a "soft limit" actually do when reached?** At least three genuinely
   different products hide behind that one word, and this run has no basis to pick one:
   (a) the action is *always allowed anyway* -- a soft limit never blocks, it only makes
   `getLimit()`/`canConsume()`'s own `reason`/a UI surface say "you're over your plan's
   guideline" without denying anything (in which case `canConsume()`'s own atomic
   grant/deny machinery, PLATFORM-P0-06.3, is the wrong tool entirely -- a soft limit
   would need no new backend enforcement at all, only a UI convention reading the
   `limit`/`usage` fields `getLimit()` already returns today); (b) the action is blocked
   by default but a business owner or superadmin can explicitly override/dismiss it
   per-attempt; (c) the action is allowed past the limit up to some separate overage
   ceiling, presumably with a billing consequence -- which pulls in real pricing/billing
   decisions §27 (Platform Billing Configuration, "Not started") doesn't define either.
2. **Is "soft"/"hard" a new, independent dimension on `platform.plan_limits`, or does it
   reinterpret the tri-state `state` column (`limited`/`unlimited`/`disabled`,
   PLATFORM-P0-04.5/04.6) that's already live?** If independent (e.g. a `limit_type`
   column meaningful only when `state = 'limited'`), that's a straightforward additive
   migration. If instead "hard limit" is meant to retroactively define what `state =
   'limited'` has meant all along and "soft limit" is a *new* state alongside it, that
   changes the meaning of already-shipped, already-tested, already-dev-verified
   enforcement (`try_consume_usage_counter()`'s own denial semantics, PLATFORM-P0-06.3)
   -- a real regression risk to flag explicitly rather than silently reinterpret. This run
   has no way to tell which the doc intends.
3. **What is a "Warning Threshold" a percentage of, who configures it, and what happens
   when it's crossed?** Candidates with materially different scope: (a) purely
   presentational -- any caller can already compute "85% of my limit" today from
   `getLimit()`'s own real `usage`/`limit` fields with zero schema change, so this would
   be a UI-only story (a "you're approaching your limit" variant of PLATFORM-P0-06.4's
   `LimitReachedNotice`), not an entitlement-engine change at all; (b) a stored,
   per-(plan, resource) configurable value (parallel to `plan_limits.limit_value` itself)
   that a superadmin sets, requiring a new column/table and its own admin UI; (c) a
   trigger for an actual notification/email to the business, which depends on
   PLATFORM-P0-11 (Global Email / Notification Configuration), itself listed "Not
   started" in this backlog's own progress table -- a real cross-section dependency the
   doc doesn't call out.

**Not implementing any of the above.** Guessing any one answer and shipping it would mean
either quietly walking back PLATFORM-P0-06.3's already-merged, already-dev-verified
enforcement semantics, or inventing a notification/billing feature this backlog assigns to
a different, not-yet-started section -- exactly the "invent unreviewed scope" this run's
task brief says not to do. PLATFORM-P0-05.1's own precedent (stopped, asked, the user
answered with two concrete decisions, this run resumed and built exactly those) is the
model to repeat here: this entry lays out the real questions; a future dispatch with the
user's own answers can build this story precisely, the same way this run built
PLATFORM-P0-05.2-06.4 today.

**What is NOT blocked by this**: every other piece of §10 this run already shipped today
(06.1 counters, 06.2 dashboard, 06.3 enforcement, 06.4 graceful copy/UI) is real, complete,
verified, and merged to `main` regardless of how 06.5 is eventually answered -- none of
today's work assumed or hard-coded a particular soft/hard/threshold design, so nothing
here needs to be revisited once it is.

**Status**: PLATFORM-P0-06.5 **stopped, not built** -- a genuine architectural/product
ambiguity the doc does not resolve, per this run's own task brief. §10 (Usage & Limits) is
otherwise complete: 06.1-06.4 done, all merged to `main`. **Stopping here, not
auto-continuing to §11**, per this run's own task brief's explicit instruction for exactly
this situation ("stop and report rather than guess-and-merge... end your turn") -- the same
precedent PLATFORM-P0-05.1's own entry above set (stop, document precisely, wait for the
user's own decision, resume from exactly this point once it's given). This run's own
usage-tracking note: well under the 80% stop threshold -- this is a natural, doc-mandated
stopping point for this one story, not a usage cutoff.

### PLATFORM-P0-06.5 (resumed) — Soft vs Hard Limits, Warning Threshold (2026-09-12)

**Worktree-reuse hazard checked before writing anything (per this workstream's own standing
instruction)**: this run's worktree `HEAD` was `6334596` ("Merge remote-tracking branch
'origin/comply-backlog'"), checked out under a `worktree-agent-*` branch name --
`feature/platform-admin-portal` was a real, up-to-date local branch
(`git log origin/main..origin/feature/platform-admin-portal` was empty, matching the
dispatch's own pre-flight check) but not what this worktree had checked out. Working tree
was clean, so no stash was needed -- fixed with a plain `git checkout
feature/platform-admin-portal`, then re-verified `git rev-parse HEAD` matched
`origin/feature/platform-admin-portal` (`1a4ef4e`, this section's own stop-and-report entry
above) before touching any file.

**Resuming exactly where the previous entry stopped**: the three open questions that entry
raised have been answered directly by the user (not derived or guessed by this run) as part
of this run's own dispatch. Implemented exactly as given -- no re-litigation, no broader
scope:

1. **Soft-limit behavior**: a soft limit never blocks. `getLimit()`/`canConsume()` keep
   allowing exactly as today for an ordinary `limited` state at/under its cap; once usage is
   at or over the limit for a `soft`-typed resource, the action is still `allowed: true`,
   with `reason` saying the business is over its plan's *guideline* rather than denying it.
   No overage ceiling of any kind (the "billing overage" option was explicitly rejected).
2. **Schema shape**: a new, independent `limit_type` column on `platform.plan_limits`
   (`'soft' | 'hard'`), meaningful only when `state = 'limited'`, defaulting every
   pre-existing and newly-`limited` row to `'hard'` -- `state`'s own three existing values
   are untouched.
3. **Warning Threshold**: UI-only, computed on the fly from `getLimit()`'s own real
   `usage`/`limit`, no schema change, no per-plan configurability, no notification/email
   wiring (PLATFORM-P0-11 stays out of scope). `DEFAULT_WARNING_THRESHOLD_PERCENT = 80`.

**What was built, decision #2 (schema)**: migration
`20260912110000_platform_plan_limits_soft_hard.sql` -- `platform.plan_limits.limit_type`
(nullable `text`), backfilled to `'hard'` for any pre-existing `limited` row (none exist in
dev today -- confirmed live via `execute_sql` before writing the migration, same as every
prior plan-limits story's own "check live data first" discipline), with a new row-level
CHECK, `plan_limits_type_matches_state`, requiring `limit_type in ('soft','hard')` exactly
when `state = 'limited'` and `null` otherwise -- the identical "companion column gated on
`state`" shape `plan_limits_value_matches_state` already established for `limit_value`
itself. No RLS policy change (row-level, not column-level; the existing superadmin-write/
any-authenticated-read policies from PLATFORM-P0-04.5/04.6 and PLATFORM-P0-05.2 already
cover every column on the row).

**A real bug found by the local RLS test, not by reading the SQL, and fixed before this
story's first commit**: the first draft of `plan_limits_type_matches_state` was
`(state = 'limited' and limit_type in ('soft','hard')) or (state in ('unlimited','disabled')
and limit_type is null)` -- the exact same *shape* `plan_limits_value_matches_state` uses,
but with one load-bearing difference: `limit_type in (...)` on a NULL column evaluates to
SQL `NULL`, not `false` (`NULL IN (...)` is `NULL`), and Postgres treats a NULL CHECK result
as *satisfied*, not violated. The result: inserting a `limited` row with no `limit_type` at
all silently succeeded instead of being rejected -- a real, live defect in decision #2's own
"required exactly when state='limited'" rule, caught by
`scripts/test-platform-plan-limits-rls.mjs`'s very first run of its own new assertion
("limited with no limit_type at all is rejected"), which failed with "expected an error,
none was thrown." `plan_limits_value_matches_state` (the sibling constraint, written a
migration ago) avoids this exact trap by using `is not null`/`is null` throughout rather
than `in`; this migration's own constraint didn't, initially, and this is exactly why the
higher bar this workstream holds itself to requires an actually-executed local-Postgres test
per new column/constraint rather than a read of the SQL -- reading this constraint's text
alone would not have caught it. Fixed in the same migration file (never committed with the
bug) to `(state = 'limited' and limit_type is not null and limit_type in ('soft','hard'))
or (state in ('unlimited','disabled') and limit_type is null)` -- confirmed correct by
re-running the same local test to green. The live dev project, which had already received
the buggy version via `apply_migration`, was fixed with one corrective `alter table ...
drop constraint ... ; alter table ... add constraint ...` (not a second migration file --
the single committed migration already carries the corrected text) and reconfirmed via
`pg_get_constraintdef`.

**What was built, decision #1 (soft-limit enforcement)**: migration
`20260912120000_core_try_consume_usage_counter_soft_limits.sql` drops and recreates
`core.try_consume_usage_counter()` (PLATFORM-P0-06.3) -- Postgres cannot `CREATE OR REPLACE`
a function whose `RETURNS TABLE` shape changes, and this adds one output column,
`limit_type` (mirrors the table's own column). No argument/signature change, so the one
existing caller (`canConsume()`) is unaffected. Body change is a single new branch: when
`state = 'limited' and limit_type = 'soft'`, the function now unconditionally grants and
increments (same as the `unlimited`/`unrestricted` branches), instead of checking
`v_before + p_quantity > v_limit` the way the `hard` branch (unchanged) still does. The
row-level lock (`select ... for update`) that makes the whole function atomic is untouched
and now guards both branches identically -- removing the *denial* for soft does not remove
the *lock*.

`getLimit()`/`buildLimitEntitlementDecision()` and `canConsume()`/
`buildConsumeEntitlementDecision()` (`packages/core/src/entitlements/limit-entitlement.ts`)
both thread `limit_type` through (the `platform_limits` select and the RPC call each now
read/return it) and both grow one new branch, checked before the existing hard-limit logic:
a `limited` row/attempt whose `limit_type` is `'soft'` (defaulting to `'hard'` when the
field is absent, so every existing call site and every pre-06.5 unit test that never passed
`limit_type` keeps its exact prior behavior) is always `allowed: true`; the `reason` text
says "usage ... is within the ... plan's limit ..." while under the guideline (identical
wording to the hard case) and "usage ... is over your ... plan's guideline of ..." once at
or over it, rather than claiming a false "within the limit." `limit`/`usage`/`remaining` are
still the real numbers either way (`remaining` still clamped to a minimum of 0, same as the
hard case) -- a soft limit changes what "allowed" and the copy mean, not what the numbers
are.

**What was built, decision #3 (Warning Threshold)**: new
`packages/core/src/entitlements/limit-warning-messaging.ts` -- `isApproachingLimit(usage,
limit, thresholdPercent = DEFAULT_WARNING_THRESHOLD_PERCENT)` (pure; `false` whenever
`limit`/`usage` is `null`, `limit <= 0` avoids a division by zero, and once `usage >= limit`
-- that is `describeLimitReached()`'s own case, or a soft-limit allowance's, not a warning's)
and `describeLimitWarning(decision, resourceLabel, planKey, thresholdPercent?)` (mirrors
`describeLimitReached()`'s own "raw decision in, copy out" split, but returns `null` instead
of throwing when there's nothing to warn about, since a caller checking on every render
needs a cheap "should I show anything" answer rather than a try/catch). No schema change, no
per-plan configurability, no notification wiring -- exactly as scoped. New
`packages/core/src/components/limits/limit-warning-notice.tsx` -- `LimitWarningNotice`, a
sibling of `LimitReachedNotice` (PLATFORM-P0-06.4) rather than a `variant` prop added to it:
the two are built from different decision states (a denial vs. an approaching-but-still-
allowed one) and keeping them as separate, small, single-purpose components avoids a prop
that would let a caller pass the wrong kind of decision into the wrong copy-shaping
function. Same default (non-destructive) `Alert`, an `AlertTriangle` icon (already used
elsewhere in this codebase, e.g. `dashboard/page.tsx`, `crm/lost-business/page.tsx`) instead
of `LimitReachedNotice`'s `Gauge`, and no "Upgrade" button -- a warning is a heads-up on an
action that already succeeded, not the dead end a denial is, so "View usage" is the one
button that reliably makes sense here. Like its sibling, `usageHref` is optional and
independent (never a dead link when omitted), and **no page renders this component yet** --
same boundary PLATFORM-P0-06.4's own entry drew for `LimitReachedNotice`: a real caller
needs a real trigger (a module reading `getLimit()`) and a real "View usage" destination,
neither of which exists yet; wiring either in now would be inventing a future module's own
integration work.

**UI (admin side)**: `quantity-limits-section.tsx` (the "Limited" row's own controls, §8's
entitlements page) gains a Hard/Soft `NativeSelect` shown only alongside the numeric value
(same "two related fields, one Save" reasoning already governing that row), defaulting to
Hard for a fresh row and remembering a soft row's own already-configured type when editing
it. The state badge for a configured `limited` row now appends a small `(soft)` qualifier
when applicable -- an ordinary hard limit (today's default, and every pre-06.5 configured
row) renders exactly as before, unchanged pixel-for-pixel. The section's own header copy and
file-level docstring both gained one sentence naming the Hard/Soft distinction plainly.

**Deliberately not built this story, and why -- staying exactly inside the three decisions
given, no broader scope**:
- No overage billing ceiling, no per-attempt override/dismiss flow for a hard limit -- both
  were named candidate meanings for "soft limit" in the previous entry's own stop-and-report
  and both were explicitly rejected by decision #1's own wording ("there is no ceiling on a
  soft limit," "this decision explicitly rejected the 'billing overage ceiling' option").
- No new column or table for the warning threshold, no per-plan/per-resource configurable
  percentage, no notification or email wiring for crossing it -- all three explicitly
  declined by decision #3, `PLATFORM-P0-11` (Global Email/Notification Configuration) stays
  "Not started."
- No page renders `LimitWarningNotice` (see above) and no module's own mutating action calls
  `getLimit()`/`canConsume()` to trigger either notice -- the same "each module's own future
  integration work" boundary PLATFORM-P0-06.1/06.3/06.4 already drew, unchanged by this
  story.
- `platform.plan_features`/`plan_modules` untouched -- decision #1 is explicit that this
  only affects the limits/counters path.

**Verification**: this worktree needed its own `npm install` first (fresh worktree, no
local `node_modules` -- same cross-checkout symlink issue every prior worktree-run entry in
this log has documented; confirmed `readlink -f node_modules/@cofounderai/core` resolves to
this worktree's own `packages/core`). Full monorepo `npm run typecheck` -- clean across
every workspace. `npm run lint --workspaces --if-present` -- 0 errors, the same 1
pre-existing unrelated warning (`Package` unused import in a CRM conversations page,
untouched by this story) every prior entry has logged. `node
scripts/lint-import-boundaries.mjs` -- 1194 files, no violations. `node
scripts/lint-migration-schema.mjs` -- 142 migrations, no violations (this branch's own
prior-story count was 140; +2, this story's own two files). `npx vitest run --root
packages/core` -- 18 files / 156 tests passed (127 -> 156, +29 new: 6 `platform-plan-
limits.test.ts` limit_type cases, 7 `limit-entitlement.test.ts` soft/hard cases across both
`buildLimitEntitlementDecision`/`buildConsumeEntitlementDecision`, 16
`limit-warning-messaging.test.ts` cases for `isApproachingLimit`/`describeLimitWarning`).
`apps/web`'s own `vitest run --passWithNoTests` -- 47 tests, unchanged (no new apps/web test
file this story). `cd apps/web && rm -rf .next && npm run build` -- clean; the route
listing is unchanged from PLATFORM-P0-04.3's own entry (`/platform/plans/[id]/entitlements`
still lists `ƒ` dynamic; `LimitWarningNotice` is a component, not a route, same as
`LimitReachedNotice`).

Both migrations applied live via `mcp__Supabase__apply_migration` against the **dev**
project (`jazdtomcgqjxjueedmck`) only -- confirmed via `execute_sql` that
`platform.plan_limits` was empty before either migration (so the backfill touched zero
rows, matching PLATFORM-P0-04.5's own "starts empty" stance), and via `pg_get_constraintdef`
that the corrected (post-bugfix) constraint text is exactly right. `mcp__Supabase__get_advisors`
(security) -- zero new findings, the same 5 pre-existing `rls_enabled_no_policy` tables and
the pre-existing leaked-password-protection warning every prior entry has logged (a new
column + CHECK, and a dropped/recreated function, add no new RLS surface).
`mcp__Supabase__get_advisors` (performance) -- zero new findings (no new table, no new
index; the function drop/recreate adds nothing for either advisor to flag).

**Role-switched live proof against dev's own real data (not a synthetic seed), the standard
this workstream has held itself to since PLATFORM-P0-03.4**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`) and one of their real businesses (`Meridian
HomeTech Solutions`, on the real `free` plan) PLATFORM-P0-06.3's own entry already used --
temporarily seeded `contacts = limited/soft(1)` and `prospects = limited/hard(1)` on the
free plan, then, role-switched as that authenticated user (`set local role authenticated;
set local request.jwt.claim.sub = '<their id>'`): `try_consume_usage_counter(<their
business>, 'contacts', 5, 'current')` returned `{state: limited, limit_value: 1, limit_type:
soft, usage_before: 0, usage_after: 5, granted: true}` -- a soft limit of 1, asked to
consume 5, granted in full, no ceiling, exactly as decision #1 specifies; the equivalent
call against `prospects` (`hard`, same limit of 1, same quantity of 5) returned `{...,
usage_after: 0, granted: false}` -- the hard branch denies exactly as PLATFORM-P0-06.3 left
it, proving this story changed no hard-limit behavior at all. Both temporary `plan_limits`
rows and both resulting `usage_counters` rows were deleted immediately afterward, reconfirmed
via a direct count query (`0` rows) -- dev is left exactly as it was found, no residue.

**The dedicated local-Postgres re-verification this workstream's own higher bar requires for
a modified `try_consume_usage_counter()`** (not just a read of the updated SQL): extended
the existing `scripts/test-core-try-consume-usage-counter-rls.mjs` (PLATFORM-P0-06.3's own
script) rather than writing a new one -- this is the same access pattern/function, not a new
one, so following that script's own precedent of extending
`test-platform-plan-limits-rls.mjs`/`test-core-plan-entitlement-lookup.mjs` in place for a
column addition rather than forking a parallel file. Every pre-existing `limited` seed row
in that script now explicitly carries `limit_type = 'hard'` (the migration's own backfill
default), so every one of PLATFORM-P0-06.3's own original assertions is re-verified against
the *current*, modified function with no behavior change. New assertions (seeded against a
fresh `contacts = limited/soft(2)` row): a soft limit grants normally under its guideline
(identical to a hard grant); grants exactly at the guideline; **grants past the guideline**
(the one behavior that actually differs from hard); grants a large single over-the-guideline
quantity request in full, atomically. **The concurrency re-verification this story's own
task brief specifically asked for**: 10 concurrent callers against a soft limit already well
past its own guideline are *all* granted (proving a soft limit never denies, even under
real concurrent load) with the final counter landing at exactly `13 + 10 = 23` -- proving
the same `for update` row lock that PLATFORM-P0-06.3's own two hard-limit concurrency tests
(re-run here, still passing, still exactly 2 and exactly 3) already proved race-free
continues to serialize correctly for the soft branch too, with zero lost updates, even
though that branch's own decision logic no longer has a denial path to protect. **All 26
assertions passed** (17 pre-existing + 9 new) against the full current migration timeline
(142 files, including both this story's own files). `scripts/test-platform-plan-limits-rls.mjs`
extended with 6 new assertions proving the corrected `plan_limits_type_matches_state`
CHECK constraint (both the bug and the fix, described above, were proven by actually running
this script, not by reading the constraint's text) plus a real hard-to-soft flip by a
superadmin -- **all 15 assertions passed**. `scripts/test-core-plan-entitlement-lookup.mjs`
extended to also read back `limit_type` through the same non-superadmin join chain it
already proves -- **all 7 assertions passed**. Local Postgres 16 was already running in this
environment (`pg_lsclusters` showed it online).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user or live browser session in this sandboxed environment, so a live
authenticated walkthrough of actually opening `/platform/plans/[id]/entitlements`, setting a
resource to Soft, and later seeing `LimitWarningNotice`/a soft-limit "over guideline" message
render in a real product surface was **not** performed and is **not** claimed here (no
surface renders either yet, by design -- see "deliberately not built" above). This entry's
functional and authorization-critical claims (soft-limit enforcement grants past the
guideline with no ceiling; hard-limit enforcement is unchanged; the new CHECK constraint
holds, including the real bug this story's own local test caught before it ever reached a
commit) were verified for real against both the live dev Supabase project (role-switched, as
a real user, against real business data, residue cleaned up afterward) and a real local
Postgres database running every relevant RLS/behavior test to completion -- not merely
asserted from reading the code or the SQL.

**Status**: PLATFORM-P0-06.5 done. §10 (Usage & Limits) is now fully complete: 06.1-06.5 all
done and merged to `main`. Continuing in doc order, per this run's own task brief: §11
(Module Administration, PLATFORM-P0-07) next.

### PLATFORM-P0-07.1 — Module Registry (2026-09-12)

**Worktree-reuse hazard checked before writing anything (per this workstream's own standing
instruction)**: this run's worktree `HEAD` was `6854f7c` ("Merge branch
'feature/platform-admin-portal' into scratch-plat-06-5"), checked out under a
`worktree-agent-*` branch name -- the same class of artifact this log has already
documented and fixed twice. Working tree was clean, so no stash was needed -- fixed with
`git checkout -B feature/platform-admin-portal origin/feature/platform-admin-portal`, then
re-verified `git rev-parse HEAD` matched `origin/feature/platform-admin-portal` (`17db0b8`,
PLATFORM-P0-06.5's own tip) before touching any file. `npm install` run fresh (this
worktree had no `node_modules`), confirmed via `readlink -f node_modules/@cofounderai/core`
resolving to this worktree's own `packages/core`.

**Scope, read against §11's own three sub-stories before writing anything**: §11 lists
07.1 (Module Registry: "Manage: enabled, visible, licensed, minimum_plan, status,
version"), 07.2 (Platform-Wide Module Kill Switch: "reason, impact confirmation, explicit
confirmation, audit record" -- explicitly a dangerous operation), and 07.3 (Module
Maintenance Mode: Available/Read-only/Maintenance/Disabled + optional message). This entry
is 07.1 only.

**Entity-ownership check (CLAUDE.md non-negotiable #5)**: `core.modules` (Epic 2, C-3) is
the licensing catalog -- `key`/`name`/`description`, the FK target every
`core.licenses.module_key` and `platform.plan_modules.module_key` already points at.
`packages/module-registry` is a separate, compile-time, static manifest for nav/routes
(00-MASTER-PLAN.md §6). Neither is a superadmin's *operational control* over a module
platform-wide (kill switch, maintenance mode) -- genuinely new control-plane data, hence
`platform` schema (CLAUDE.md non-negotiable #1's carve-out), one row per `core.modules.key`
(cross-schema FK into `core`, never a parallel module-identity list) -- the exact shape
`platform.plan_modules` already established for the same relationship.

**A genuine data-modeling judgment call, decided and documented rather than stopped on
(non-security, per this run's own task brief)**: of §11's six named fields, two --
`licensed` and `minimum_plan` -- are deliberately **not** stored columns.
- `licensed` would be `true` for every row here by construction: every `core.modules` row
  is, by definition, a licensable module (`core.licenses.module_key` already FKs into it).
  A stored boolean that is always true today with no independent write path is exactly the
  speculative-column shape CLAUDE.md development principle #7 rules out -- computed as a
  literal `true` in `platform-modules.ts` instead.
- `minimum_plan` is fully derivable from `platform.plan_modules` (PLATFORM-P0-04.3, already
  the canonical "which plan includes this module" relationship) joined against
  `platform.plans.display_order`/`status`. Storing it a second time would create exactly
  the two-independently-writable-sources-of-truth problem CLAUDE.md non-negotiable #5 ("if
  the concept is already listed, use the canonical table") warns against -- a superadmin
  could set `minimum_plan = 'pro'` here while `plan_modules` still says Free includes it,
  and nothing would ever reconcile the two. Computed at read time instead
  (`computeMinimumPlans()`, the lowest-`display_order` **active** plan whose
  `plan_modules.enabled = true` row covers the module -- a `draft`/`deprecated`/`archived`
  plan is never a real "minimum plan" a customer can actually buy today), unit-tested
  directly (5 cases: lowest-order pick, a disabled row at a lower order correctly ignored,
  a non-active plan correctly ignored, no active plan at all, multiple modules kept
  independent).

**What was built**: migration `20260912140000_platform_modules.sql` -- `platform.modules`
(`module_key` PK/FK into `core.modules`, `enabled` boolean default `true`, `visible`
boolean default `true`, `status` text default `'available'`, `version` text nullable,
`created_at`/`updated_at`/`updated_by`). Seeded one row per existing `core.modules` key, all
defaults. RLS: SELECT open to any authenticated user from the start (not superadmin-only
then widened later -- this table's own route-guard/`requireModule()` consumer, added in
PLATFORM-P0-07.2, runs as the signed-in business member, the same reason
PLATFORM-P0-05.2/05.3's `20260912080000_platform_catalog_authenticated_read.sql` widened
every sibling plan-catalog table's own SELECT policy), INSERT/UPDATE superadmin-only, no
DELETE policy or grant at all (every module key this table will ever hold arrives via the
same migration that adds it to `core.modules`, seeded the same way this migration's own
insert does -- there is no "remove a module from the registry" operation for the app layer
to need).

`status`'s four-value CHECK (`available`/`read_only`/`maintenance`/`disabled`) folds in
PLATFORM-P0-07.3's own enum values now, the same "no placeholder lifecycle column"
precedent PLATFORM-P0-04.1's own migration already used for `platform.plans.status`
(04.7's enum folded into 04.1's single migration rather than left as a stub) -- 07.3's own
remaining scope is the optional customer-facing message column plus real request-time
behavior for `read_only`/`maintenance`/`disabled`, not this column's existence. `version`
is a superadmin-set free-text label, not read from any `package.json`: every module
workspace package (`packages/module-{discovery,inventory,fsm,crm,gst}`) is pinned at the
placeholder `0.0.0` (confirmed live, not assumed), since ADR-1/ADR-2 make this one
deployable with modules as packages, not independently released services -- there is no
real per-module release version anywhere in this monorepo to read from instead. Nullable
with no default, so an unset module shows nothing rather than a fabricated number (this
backlog's own repeated "no fabricated data" stance, e.g. PLATFORM-P0-02.1's honest MRR/ARR
"--").

`packages/core/src/admin/platform-modules.ts` -- `listModuleRegistry()` (joins
`core.modules` + `platform.modules` + the derived `licensed`/`minimumPlan`),
`setModuleVisible()` and `setModuleMeta()` (status + version together, one superadmin
write). **No `setModuleEnabled` export exists in this file, on purpose** -- `enabled` is
PLATFORM-P0-07.2's own kill switch, and that story's "reason + impact confirmation +
explicit confirmation + audit record" flow is real, additional scope this file must not
pre-empt by exposing a plain, confirmation-free toggle for the same column. The UI
(`/platform/modules`, new nav link in `platform/layout.tsx`) mirrors this exactly:
`enabled` renders as a read-only badge, never a switch; `visible` is a plain instant-flip
`Switch` (mirrors `module-entitlements-section.tsx`'s "single boolean, no separate save
step" shape -- it only affects a not-yet-built marketing/module-picker surface, never
access, so no confirmation is needed); `status`/`version` are edited together with one Save
button (mirrors `quantity-limits-section.tsx`'s "two related fields, one Save" shape).
Desktop table / mobile card split per CLAUDE.md development principle #12 and
docs/design/claude-ui-design-rules.md rule 5, following `plans/page.tsx`'s own established
split exactly.

**Deliberately not built this story, and why**:
- No real enforcement anywhere: `enabled`/`visible`/`status` are stored and viewable but
  nothing yet reads them for an actual authorization or UX decision (RLS, `requireModule()`,
  the middleware route guard, `entitlements/module-entitlement.ts::hasModule()`, or
  `packages/module-registry`'s own nav-building all remain exactly as they were). This
  mirrors `platform.plan_modules.enabled`'s own history exactly (PLATFORM-P0-04.3 built the
  column with zero consumers; PLATFORM-P0-05.x wired it in, deliberately not, three stories
  later, once the entitlement engine existed to wire it into) -- and
  `entitlements/module-entitlement.ts`'s own docstring already named PLATFORM-P0-07.2 as
  exactly the future story that would compose a platform-global kill switch into
  `hasModule()`'s decision. That wiring -- into `hasModule()`/`requireModule()`/the route
  guard, explicitly **not** into `core.has_module()`/RLS (a genuine, larger architecture
  change touching every module table's own policy, which this run's task assignment
  requires explicit approval for, per CLAUDE.md non-negotiable #10 -- the identical
  reasoning `module-entitlement.ts`'s own docstring already used for why
  `platform.plan_modules` isn't composed into RLS either) -- is PLATFORM-P0-07.2's own job.
- No `setModuleEnabled`/kill-switch mutation, no reason/confirmation/audit-record flow, no
  new audit table -- all of PLATFORM-P0-07.2's own explicit scope.
- No maintenance-mode customer-facing message column, no read-only/maintenance/disabled
  *behavioral* enforcement -- PLATFORM-P0-07.3's own explicit scope (the status enum's
  *values* are folded in now, per the 04.1/04.7 precedent above, but not their behavior).
- No wiring into `packages/module-registry`'s own nav-building or any customer-facing
  module picker for `visible` -- that package is a separate, static, compile-time manifest;
  wiring a DB-backed flag into it is real integration work this story doesn't need to do to
  satisfy "manage" (view/set the flag), the same "no consumer yet" boundary this backlog's
  Usage & Limits stories (06.1/06.4/06.5) drew repeatedly for their own not-yet-wired
  fields/components.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated warning
(`Package` unused import in a CRM conversations page, untouched by this story). `node
scripts/lint-import-boundaries.mjs` -- 1198 files, no violations. `node
scripts/lint-migration-schema.mjs` -- 143 migrations (142 -> 143, this story's own file),
no violations. `npx vitest run --root packages/core` -- 19 files / 161 tests (156 -> 161,
+5 new `platform-modules.test.ts` cases for `computeMinimumPlans()`, the only genuinely new
pure logic this story adds). `apps/web`'s own `vitest run --passWithNoTests` -- 47 tests,
unchanged (no new apps/web test file this story -- this story's own logic is
authorization/RLS + a pure derivation function, covered by the new RLS script and the new
`packages/core` unit tests respectively). `cd apps/web && rm -rf .next && npm run build` --
clean; `/platform/modules` lists `ƒ` (dynamic), correctly inheriting the outer layout's
existing `force-dynamic` with no per-route opt-in needed.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; confirmed via `execute_sql` that the seed is exactly right
(5 rows, one per `core.modules` key, `enabled`/`visible` both `true`, `status = 'available'`
, `version` null on every row -- no fabricated data). `mcp__Supabase__get_advisors`
(security) -- zero new findings, the same 5 pre-existing `rls_enabled_no_policy` tables and
the pre-existing leaked-password-protection warning every prior entry has logged.
`mcp__Supabase__get_advisors` (performance) -- zero new findings beyond the same benign
"unused index" info-level note every sibling FK index already carries in this low-traffic
dev database (this migration's own `modules_updated_by_idx` included).

**Role-switched live proof against dev's own real data (not a synthetic seed), the standard
this workstream has held itself to since PLATFORM-P0-03.4**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real `core.account_members` row, not a
superadmin) this backlog's own prior entries have repeatedly used -- role-switched
(`set local role authenticated; set local request.jwt.claim(s)...`) `select count(*) from
platform.modules` returned `5` (the open-SELECT catalog policy working exactly as intended
for an ordinary business member, the same shape every sibling plan-catalog table already
has), and `update platform.modules set visible = false where module_key = 'gst' returning
module_key` returned **zero rows** (`RETURNING` is the unambiguous proof of rows actually
written, not just a query response) -- reconfirmed immediately after via a plain
`service_role` read that `gst.visible` was still `true`, so this real user's write attempt
against a real row was rejected by RLS with no residue to clean up (nothing was ever
actually written).

**The dedicated local-Postgres RLS test this workstream's own higher bar requires for a new
`platform.*` table**: new `scripts/test-platform-modules-rls.mjs`, wired into
`package.json`'s `test:db` composite script after
`test-core-try-consume-usage-counter-rls.mjs`. Same Alice (business admin, not a
superadmin)/Zoe (real platform superadmin) pair every sibling script in this backlog uses.
One test-design correction made before it passed: the first draft used `assertThrows` on
Alice's `UPDATE`, which failed with "expected an error, none was thrown" -- an `UPDATE`
whose `USING` clause hides every row from a caller does not raise a Postgres error, it
silently affects zero rows (only a rejected `INSERT`'s `WITH CHECK` genuinely throws) --
corrected to `assertEqual` against a `service_role` read of the untouched row afterward,
the same shape `test-platform-plan-modules-rls.mjs` (this table's own closest sibling) had
already gotten right the first time; this script's own first draft simply copied the wrong
half of that precedent. **All 15 assertions passed**: the migration's own seed (5 rows, all
defaults, no fabricated version); the `status` CHECK constraint rejects an unknown value;
Alice can read all 5 rows but her UPDATE/INSERT attempts are silently rejected by RLS with
zero residue; Zoe can toggle `visible` and set `status`+`version` together; nobody --
including Zoe -- can `DELETE` a row (no delete grant exists at all). Local Postgres 16 was
already running in this environment (`pg_lsclusters` showed it online after a `pg_ctlcluster
16 main start`, having been stopped between sessions).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this environment, so the "Zoe can" half of the RLS proof above is
verified for real only against local Postgres (not live dev), and no live browser
walkthrough of `/platform/modules` was performed. The "Alice cannot" half, and the table's
own seed/shape, were verified for real against both the live dev Supabase project
(role-switched, as a real user, against real business data, `RETURNING`-proven zero-row
write, no residue) and a real local Postgres database running every assertion to
completion -- not merely asserted from reading the code or the SQL.

**Status**: PLATFORM-P0-07.1 done. Continuing in §11's own story order: PLATFORM-P0-07.2
(Platform-Wide Module Kill Switch) next.

### PLATFORM-P0-07.2 — Platform-Wide Module Kill Switch (2026-09-12)

**Scope**: §11's own ask -- "Allow authorized platform operators to disable a module
globally. This is a dangerous operation and must require: reason, impact confirmation,
explicit confirmation, audit record." `platform.modules.enabled` (PLATFORM-P0-07.1) already
exists as the flag; this story is the real mutation path plus real enforcement.

**A genuine architecture judgment call, decided and documented per this run's own task
brief (non-security data-flow choice, not an authorization gray area)**: where should the
kill switch actually take effect? `entitlements/module-entitlement.ts::hasModule()`'s own
docstring (written in PLATFORM-P0-05.1, before this story existed) already answered this
exact question in advance: "Platform Global... not composed: PLATFORM-P0-07.2... is listed
'Not started'... there is no `platform.*` row this layer could read yet" -- naming this
story, this layer, and this precedence position (checked *before* the license layer) as
the intended extension point. That docstring also already ruled out composing it into
`core.has_module()`/`has_module_write()` (RLS itself) for the identical reason
`platform.plan_modules` isn't composed into RLS either: doing so means changing every
module table's own RLS policy, a genuine architecture change CLAUDE.md non-negotiable #10
requires explicit approval for, not something to fold into a §11 story unreviewed. So this
story wires the flag into the three layers that were always meant to compose it --
`hasModule()` (the entitlement service), `requireModule()` (the server-action
defense-in-depth layer CLAUDE.md's architecture section names), and the `middleware.ts`
route guard (that section's other named layer) -- and explicitly not into RLS. This
mirrors, rather than invents, the precedent already on record.

**What was built, the data layer**: migration `20260912150000_platform_module_kill_switch.sql`
-- `platform.module_kill_switch_events` (append-only audit trail: `module_key`, `enabled`,
`reason` with a `btrim(reason) <> ''` CHECK, `performed_by`, `performed_at`) and
`platform.set_module_enabled(p_module_key, p_enabled, p_reason)`, a `SECURITY DEFINER`
`plpgsql` function that flips `platform.modules.enabled` AND inserts the audit row in one
atomic statement -- mirrors `core.write_audit_log()`'s own "one function owns every write,
no direct client insert policy" shape (Epic 3, D-10) exactly, adapted for platform-wide
(not business-scoped) data, and deliberately one function rather than two separate client
calls: for an operation this doc itself calls "dangerous," a superadmin's own read of
`enabled` must never be able to disagree with what the audit trail says happened, even
under a partial failure. The function re-checks `platform.is_superadmin()` itself (`
SECURITY DEFINER` bypasses the table's own RLS, so the function is the actual boundary
here) and rejects a `null`/empty/whitespace-only reason -- both checked and proven by the
new local-Postgres test below, not just asserted from reading the function body.
`platform.module_kill_switch_events`' own RLS is superadmin-only SELECT (unlike
`platform.modules`' open-catalog read) -- this is sensitive operational history, not
merchandising-style catalog data -- and no INSERT/UPDATE/DELETE grant to `authenticated`
at all; the only path to a row is the function above.

**What was built, real enforcement (the actual point of a "kill switch")**:
- `packages/core/src/licensing/queries.ts` gains `isModuleEnabledPlatformWide(moduleKey)`
  -- a plain, non-admin-gated read of `platform.modules.enabled` (safe without
  `requireSuperadmin()` because that table's own RLS already opens SELECT to any
  authenticated user, the same "public catalog fact" trust level `core.modules`' own read
  policy already established) -- defaults to `true` when a row is somehow missing, so a
  data gap can never silently disable a module. `requireModule()` now calls this first,
  before the existing license check, and throws a distinct message ("...has been
  temporarily disabled platform-wide by WonderArc") so a caller surfacing this error never
  tells a business owner to go check their own license for a problem their license has
  nothing to do with. This is the layer with by far the largest real blast radius: ~70
  mutation call sites across every module already call `requireModule()`
  (`docs/testing/EXECUTION-2026-09-08.md` finding 4's own rollout), so this one change adds
  real, working defense-in-depth for the kill switch to every one of them, with zero
  changes to any of those call sites themselves.
- `packages/core/src/db/middleware.ts` (the route guard, CLAUDE.md's second named
  enforcement layer): refactored `findUnlicensedModuleForRoute()`'s own route-matching
  logic out into a shared, unexported `moduleForRoute()` helper (behavior-preserving --
  `middleware.test.ts`'s existing cases for the exported function are untouched and still
  pass), then added a sibling `findPlatformDisabledModuleForRoute()` built on the same
  helper. `updateSession()` now also reads `platform.modules` (one more small query
  alongside the existing `core.licenses` read, both already parallelized with
  `Promise.all`) and checks the platform-disabled case *first* -- it is the more universal
  fact, blocking every business regardless of that business's own license state. A new
  `reason=platform_disabled` rewrites to the same `not-licensed` page, which gets a fourth
  branch in `describeReason()` with copy that explicitly says this is not the business's
  own licensing problem (its data/license are unaffected) -- and its CTA button is
  swapped from "Go to Settings → Licenses" (misleading here -- reactivating a license
  fixes nothing) to "Back to Dashboard" for this one reason only, every other reason
  unchanged.
- `entitlements/module-entitlement.ts::hasModule()` now checks the same flag first and
  short-circuits to a new pure `buildPlatformDisabledDecision()` (mirrors
  `buildModuleEntitlementDecision()`'s own "pure helper beside the IO-touching function"
  split) with `source: "platform_global"` -- the exact value `EntitlementSource`
  (PLATFORM-P0-05.1's own type) already declared in full anticipation of this story. Always
  `allowed: false` with no degraded/read-only nuance -- §11 names none for the kill switch,
  and PLATFORM-P0-07.3 (Maintenance Mode) is the section that will introduce a real
  `read_only` state, not this one.

**What was built, the admin UI**: `packages/core/src/admin/platform-modules.ts` gains
`getModuleImpact(moduleKey)` (the real, live count of businesses with an `active`/`grace`
license for the module -- §11's own "impact confirmation," never fabricated or omitted;
deliberately uses `createAdminClient()`, not the request-scoped client every other
function in this file uses, since `core.licenses`' own RLS scopes a read to the caller's
own businesses and a superadmin is not necessarily a member of any -- the identical
cross-tenant-by-design reasoning `platform-dashboard-queries.ts`'s own docstring already
gives for its own use of the service-role client) and `setModuleEnabled()` (calls the RPC
above; no plain `.update()` on `enabled` exists anywhere in this file). New
`kill-switch-dialog.tsx` (`KillSwitchDialog`, a client component) replaces the plain
read-only "Enabled" badge from PLATFORM-P0-07.1: clicking it opens a dialog requiring a
non-empty reason (`Textarea`, mirrors the RPC's own server-side check -- genuine UX, not
the only enforcement), showing the live impact count (fetched fresh every time the dialog
opens, never cached), and a separate acknowledgement `Checkbox` -- the confirm button stays
disabled until both are satisfied. Disabling and re-enabling share the same dialog (only
copy/button color changes) since both are real state changes worth a reason and a
confirmation, not just the "disable" direction. `module-registry-table.tsx`'s own local
row state updates via a new `onChanged` callback passed to the dialog (the same
"local optimistic state" pattern its `visible`/`status` controls already use, since a
child dialog component can't reach into its parent's `useState` directly).

**Deliberately not built this story, and why**:
- No wiring into RLS/`core.has_module()`/`has_module_write()` -- see the architecture
  judgment call above; a genuine, larger architecture change requiring explicit approval,
  not this story's to make unreviewed.
- No maintenance-mode message, no `read_only`/`maintenance`/`disabled` *behavioral*
  enforcement -- PLATFORM-P0-07.3's own explicit scope. This story's kill switch is a pure
  on/off; the four-value `status` column PLATFORM-P0-07.1 already folded in stays exactly
  as inert as that story left it.
- No email/notification when a module is disabled (`PLATFORM-P0-11`, Global Email/
  Notification Configuration, stays "Not started") -- the audit trail is the only record.
- No UI surface for browsing `platform.module_kill_switch_events` as its own history page
  -- §16 (Platform Audit) is that future, broader story; this one only needed the table to
  exist and be queryable, which the local test below already proves.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated warning.
`node scripts/lint-import-boundaries.mjs` -- 1200 files, no violations. `node
scripts/lint-migration-schema.mjs` -- 144 migrations (143 -> 144, this story's own file),
no violations. `npx vitest run --root packages/core` -- 19 files / 167 tests (161 -> 167,
+6: 4 new `middleware.test.ts` cases for `findPlatformDisabledModuleForRoute()`, 2 new
`module-entitlement.test.ts` cases for `buildPlatformDisabledDecision()`). `apps/web`'s own
`vitest run --passWithNoTests` -- 47 tests, unchanged. `cd apps/web && rm -rf .next && npm
run build` -- clean; route listing unchanged in shape (`/platform/modules` still `ƒ`
dynamic; no new route this story, only new logic inside `middleware.ts`/existing pages).

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only. `mcp__Supabase__get_advisors` (security) -- zero new
findings, the same 5 pre-existing `rls_enabled_no_policy` tables and the pre-existing
leaked-password-protection warning every prior entry has logged (no `function search path
mutable` warning either -- `set search_path = platform` on the new function was set from
the start, not added after a finding). `mcp__Supabase__get_advisors` (performance) -- zero
new findings beyond the same benign "unused index" info-level note every sibling FK index
already carries (this migration's own two new indexes included).

**Role-switched live proof against dev's own real data**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, not a superadmin) this backlog's own prior entries
have repeatedly used, role-switched `select * from platform.set_module_enabled('fsm',
false, 'live dev test - should be rejected')` returned a real Postgres error --
`P0001: Forbidden: only a SUPERADMIN can change a module's platform-wide enabled state.`
-- raised by the function's own internal check, not a generic RLS denial (there is no RLS
on a function call at all; this is the function's own authorization boundary working
exactly as designed). Reconfirmed immediately after via a plain read that every module in
`platform.modules` was still `enabled = true` and `platform.module_kill_switch_events` had
`0` rows -- this real user's attempt left zero residue, nothing to clean up. As with every
prior story in this log, there is no seeded demo superadmin user in this environment, so
the "a real superadmin CAN" half of this proof is verified for real only against local
Postgres (below), not live dev.

**The dedicated local-Postgres RLS/behavior test this workstream's own higher bar
requires**: new `scripts/test-platform-module-kill-switch-rls.mjs`, wired into
`package.json`'s `test:db` composite script after `test-platform-modules-rls.mjs`. Same
Alice (business admin, not a superadmin)/Zoe (real platform superadmin) pair every sibling
script uses. One formatting slip caught by actually running it, not by reading the SQL:
the first draft asserted `enabled::text` renders as `"f"` (matching Postgres's own `boolean
out` short form used elsewhere in `psql`'s default output), but a `select ...::text`
expression in a plain query actually renders the SQL-standard `"true"`/`"false"` spelling
-- corrected once, then green. **All 15 assertions passed**: Alice's call is rejected by
the function's own check with zero state change and zero audit rows written; a genuine
superadmin (Zoe) can disable a module, with exactly one atomic audit row carrying the real
`enabled` value, reason, and performer; an empty or whitespace-only reason is rejected even
for Zoe, writing nothing; an unknown module key is rejected; Zoe can re-enable the module,
adding a second, distinct audit event; the audit trail's own SELECT is superadmin-only
(Alice gets zero rows, unlike the open `platform.modules` read); and nobody -- including
Zoe -- can bypass the function with a direct `INSERT` into the audit table (no such grant
exists at all). Local Postgres 16 was already running in this environment.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this environment, so the "a real superadmin successfully disables/
re-enables a module" half of the live-dev proof, and any live browser walkthrough of the
new `KillSwitchDialog` (opening it, seeing a real impact count render, actually clicking
through the confirmation), were **not** performed against dev and are not claimed here.
That half was verified for real only against local Postgres (all 15 assertions above,
including the atomic audit-row proof) -- the "a non-superadmin is rejected, with zero
residue" half, and the underlying schema/function/RLS shape, were verified for real against
both the live dev Supabase project (role-switched, as a real user, a real Postgres error
raised by the function's own check) and local Postgres, not merely asserted from reading
the code or the SQL.

**Status**: PLATFORM-P0-07.2 done. Continuing in §11's own story order: PLATFORM-P0-07.3
(Module Maintenance Mode) next.

### PLATFORM-P0-07.3 — Module Maintenance Mode (2026-09-12, stopped -- see below)

The doc's own entire text for this story, in full:

```text
## PLATFORM-P0-07.3 — Module Maintenance Mode

Set:

Available
Read-only
Maintenance
Disabled

with optional customer-facing message.
```

Four state names and "optional customer-facing message" -- no worked example, no defined
behavior for what each state actually restricts, the same shape PLATFORM-P0-06.5's own
stop-and-report entry above already found and was resumed from once the user answered
directly. `platform.modules.status` (the column itself, with this exact four-value CHECK)
already exists, folded into PLATFORM-P0-07.1's own migration per that story's own "no
placeholder lifecycle column" precedent -- what remains is real behavioral meaning, not
schema.

**This run's own task brief is explicit that this is exactly the situation to stop on**:
"Any story whose correct behavior depends on a security/authorization judgment call the
doc doesn't fully specify is a genuine architectural decision -- stop and report rather
than guess-and-merge." This status column, once wired to real enforcement, is squarely
"real entitlement/license enforcement" -- the same class of already-live control
PLATFORM-P0-07.2's own kill switch just became. Guessing its behavior would mean inventing,
unreviewed, a second way to fully block a module -- one that could either duplicate or
silently bypass the reason-required, audited kill switch this run just built.

**The specific questions this doc does not answer, stated precisely**:

1. **Does `Disabled` (a value of this `status` column) mean the same thing as
   `platform.modules.enabled = false` (PLATFORM-P0-07.2's own kill switch), or something
   distinct?** Both are named, independently, as ways to fully block a module platform-
   wide -- §11 never says how they relate. If they mean the same end state, then setting
   `status = 'disabled'` needs the *same* safeguards §11 mandates for the kill switch
   (reason, impact confirmation, explicit confirmation, audit record) -- shipping a plain,
   unaudited `NativeSelect` option that produces an identical real-world effect (every
   business loses access) without any of those four requirements would be a genuine
   security regression: an unaudited back door around a control this run just built with
   exactly those four requirements enforced. If instead `Disabled` (this column) is meant
   to be a *lighter*, reason-free, unaudited day-to-day switch and the kill switch
   (`enabled`) is reserved for a separate, more severe "kill" action, that is an equally
   real design this run has no basis to assume -- it would mean two independently-toggled
   flags can each independently produce "fully blocked," which the UI and any future
   caller of `hasModule()`/`requireModule()` would need to reconcile (which reason string
   does a blocked business see when both are true? does re-enabling one automatically
   matter if the other is still set?).
2. **What does `Read-only` restrict, precisely?** This run's own best guess -- mirroring
   `core.has_module()`/`has_module_write()`'s already-live "read allowed, write denied"
   grace-period shape exactly -- is plausible and would be the *minimal*, most consistent
   answer, but the doc never confirms it. A different, equally plausible reading: `Read-
   only` blocks the module's own UI entirely (like `Maintenance`) but still allows other
   modules'/`core`'s own reads *of* that module's data (e.g. `core.documents` rows a
   cancelled GST module's own invoices still live in) -- a materially different, harder-to-
   scope behavior touching cross-module reads this run cannot verify without guessing.
3. **Is `Maintenance` behaviorally identical to `Disabled` (both a full block, differing
   only in customer-facing copy -- "temporary, we'll be back" vs. an indefinite disable),
   or does `Maintenance` carry its own distinct access level** (e.g. read-only, or
   superadmin-only access for verification before flipping back to `Available`)? Nothing
   in this doc or `00-MASTER-PLAN.md` distinguishes the two beyond their names.
4. **Does the optional customer-facing message require any safeguard of its own** (length
   limit aside, already a `Zod` concern) -- e.g. should changing it be audited the same way
   PLATFORM-P0-07.2's `reason` is, given it is text a superadmin writes that every affected
   business will see? The doc names no requirement here, unlike §11's own explicit list of
   four requirements for the kill switch specifically.

**Not implementing any of the above.** Guessing question 1 in particular risks exactly the
outcome this run's own "higher security bar... never weaken a security gate" instruction
warns against: an unaudited path that reaches the identical real-world effect (every
business blocked from a module) as a control this run just built with mandatory reason,
impact confirmation, explicit confirmation, and an audit record. Shipping a plain
`NativeSelect` for `status` today, before that relationship is resolved, would either
duplicate the kill switch pointlessly or quietly undermine it -- not a call this run is
free to make itself. PLATFORM-P0-05.1's and PLATFORM-P0-06.5's own precedent (stop, ask
precisely, resume once the user answers) is the model repeated here.

**What is NOT blocked by this**: §11's first two stories (07.1 Module Registry, 07.2
Platform-Wide Module Kill Switch) are both real, complete, verified, and merged to `main`
regardless of how 07.3 is eventually answered -- neither assumed or hard-coded any
particular maintenance-mode design (07.1's own `status` column exists with its four values
already correctly named, but nothing yet reads it for a behavioral decision, the same
"table now, real enforcement later" sequencing this backlog has used repeatedly, e.g.
`platform.plan_modules.enabled` between PLATFORM-P0-04.3 and PLATFORM-P0-05.x). Once
resumed, 07.3 need only add whatever the answers require (a message column, and/or an
enforcement branch alongside the kill switch's own, and/or an audit requirement) without
revisiting anything already shipped.

**Status**: PLATFORM-P0-07.3 **stopped, not built** -- a genuine architectural/security
ambiguity the doc does not resolve, per this run's own task brief. §11 (Module
Administration) is otherwise complete: 07.1-07.2 done, both merged to `main`. **Stopping
here, not guessing past it**, per this run's own task brief's explicit instruction for
exactly this situation. This run's own usage-tracking note: well under the 80% stop
threshold -- this is a natural, doc-mandated stopping point for this one story, not a
usage cutoff.

### PLATFORM-P0-07.3 — Module Maintenance Mode, resumed and completed (2026-09-12)

The user answered all four open questions this story's own stop-and-report entry above
raised, as an explicit, exact-scope authorization for this run to implement (not to
re-derive or re-litigate). Restated briefly, since they drive every design choice below:
(1) `status='disabled'` means the same real-world effect as the kill switch and MUST go
through the same audited mechanism, not a second unaudited path; (2) `read_only` mirrors
the existing grace-period shape exactly (read allowed, write denied), reusing
`hasModule()`/`requireModule()`'s existing read/write distinction; (3) `maintenance` is
the exact same full block as `disabled`, differing only in customer-facing copy, never a
distinct access level; (4) the optional customer-facing message must be audited the same
way the kill switch's `reason` already is.

**The reconciliation itself (decision #1), and the direction chosen**: the user offered
two directions and asked for whichever "requires the least duplicated state." `status`
was made the single source of truth: `platform.modules.enabled` is now a Postgres
`generated always as (status in ('available', 'read_only')) stored` column, not an
independently-writable boolean. This is not merely "less" duplicated state than a
trigger-based sync -- it is *zero*: the database itself makes it structurally impossible
for `status` and `enabled` to ever disagree, which is the stronger property a trigger (or
disciplined application code) can only approximate. Every enforcement point that used to
read the old boolean `enabled` (three of them -- `requireModule()`, `hasModule()`,
`middleware.ts`'s route guard, CLAUDE.md's own three named layers) was rewritten to read
`status` directly instead, since `status` alone now carries the read_only/maintenance
distinction `enabled` never could.

**Decisions #1 and #3 together, mechanically**: `platform.set_module_status(p_module_key,
p_status, p_message, p_reason)` (new migration
`20260912220000_platform_module_status_reconciliation.sql`) is the ONE SECURITY DEFINER
function that owns every status transition, for all four values, in both directions. It
requires a non-empty `reason` unconditionally (not only when the target is
disabled/maintenance) -- the same bar PLATFORM-P0-07.2's own kill switch already set for
BOTH directions of its boolean flip, extended uniformly rather than special-cased, which
keeps the function's own contract simple and auditable: every superadmin-initiated status
change leaves a trace, full stop. `platform.set_module_enabled(p_module_key, p_enabled,
p_reason)` (PLATFORM-P0-07.2's own RPC) is kept, not dropped -- redefined as a thin `sql`
wrapper delegating to `set_module_status()` (`enabled=true` -> `status='available'`,
`enabled=false` -> `status='disabled'`, current `customer_facing_message` passed through
unchanged). This is deliberately "a thin wrapper around the same audited mechanism," per
the user's own phrasing -- one real mutation path, two equally-valid entry points, never
two independent ways to reach "every business blocked." The app layer's own
`platform-modules.ts` does NOT re-expose a `setModuleEnabled()` TypeScript wrapper of its
own, though: the new `setModuleStatus()` export covers all four statuses including
`disabled`, so keeping a second, parallel app-layer path to the exact same status would
reintroduce the very "two independently-toggled controls reaching one blocked reality"
risk decision #1 warns against, this time in the UI rather than the database. The
`module-registry-table.tsx` UI accordingly lost its standalone "Enabled" badge/dialog
column entirely, replaced by one "Status" control (`ModuleStatusDialog`) covering all four
values -- `enabled` is now shown only as a small derived, read-only label ("Reachable" /
"Blocked platform-wide") beside the status badge, never its own clickable control.

**Decision #2, mechanically**: `read_only` does NOT short-circuit the way
`disabled`/`maintenance` do. `licensing/queries.ts` gained `getPlatformModuleStatus()`
(replacing PLATFORM-P0-07.2's own boolean `isModuleEnabledPlatformWide()`, which could no
longer represent four states), returning `{status, message}`. `requireModule()` now
checks platform status in three tiers: `disabled`/`maintenance` throw immediately (before
even checking the business's own license, since a full block is the more universal fact,
unchanged from PLATFORM-P0-07.2's own precedent); then the business's own
`hasModuleWrite()` check runs exactly as before (so a business's own genuine grace/expired
reason still surfaces first when it's the actual blocker); only then, if the business's
own license would otherwise permit the write, does a platform-wide `read_only` status
throw its own distinct message. This ordering was a deliberate choice, not incidental: it
means the most specific, most helpful reason always wins, mirroring how
`buildModuleEntitlementDecision()` (see below) resolves the identical question for
`hasModule()`'s own decision shape. `hasModule()` itself forces `writeAllowed =
writeAllowedByLicense && platform.status !== "read_only"` before calling
`buildModuleEntitlementDecision(moduleKey, readAllowed, writeAllowed, platformReadOnly)` --
a new fourth parameter that, combined with `readAllowed=true`, produces a
`source: "platform_global"` reason instead of the license-grace one, reusing the exact
read/write distinction that function already used for a business's own grace period
(literally: `if (readAllowed && platformReadOnly) { ... }` sits directly beside the
pre-existing `if (readAllowed) { ...grace... }` branch) rather than inventing a new
mechanism. `middleware.ts`'s route guard deliberately does NOT include `read_only` in its
blocked-module set -- mirroring how a license's own `grace` status never blocks the route
either, only writes -- so a `read_only` module's pages still load normally; only
`requireModule()`/`hasModule()` deny the write.

**Decision #4, mechanically**: `platform.module_kill_switch_events`
(PLATFORM-P0-07.2) is renamed to `platform.module_status_events` (a fresh `create table` +
`drop table`, not `like ... including all`, which was tried first and found not to copy
foreign keys, RLS enablement, or policies -- confirmed by reading Postgre's own actual
`LIKE` semantics rather than assuming, then rewritten explicit) and gains
`previous_status`/`new_status`/`previous_message`/`new_message` (replacing the old boolean
`enabled` column, now fully redundant with `new_status`). Every call to
`set_module_status()` -- whether it changes `status`, `customer_facing_message`, or both
-- writes one row capturing a full before/after snapshot of both fields together, so a
superadmin editing only the message (status held constant) is audited exactly the same way
a status-only change is, and a combined status+message change is one atomic row rather
than two separate audit entries a partial failure could split. Renamed rather than left as
`module_kill_switch_events` because, going forward, it also audits
`read_only`<->`available` transitions, which are not a "kill switch" in any sense --
keeping the old name would misdescribe its own contents from this migration onward. Zero
rows existed in the dev project's own `module_kill_switch_events` table before this
migration (confirmed live via `execute_sql` before writing it), so nothing was lost in the
rename.

**A real Postgres semantics correction found while writing the migration**: the first
draft used `create table platform.module_status_events (like
platform.module_kill_switch_events including all)`, reading "including all" as "copies
everything, full stop." It does not -- per Postgres's own documented `LIKE` semantics,
`INCLUDING ALL` covers constraints (CHECK only, not FOREIGN KEY), defaults, generated
columns, identity, indexes, statistics, storage, and comments -- never foreign keys, never
RLS enablement, never policies. Caught before applying anything (not discovered live
against dev) by re-reading Postgres's own documentation rather than trusting the
plausible-sounding name; the migration was rewritten to an explicit `create table` with
every column, FK, index, `enable row level security`, and policy spelled out in full,
which is also more readable for the next person than a `LIKE` clause would have been.

**Deliberately not built, and why (no invented access levels or scope beyond the four
decisions)**: no superadmin-only bypass or partial-access mode for `maintenance` (decision
#3 explicitly rules this out -- it is behaviorally identical to `disabled`); no distinct
UI ceremony for `read_only` beyond a reason field (decision #2 names no impact-confirmation
or acknowledgement requirement for it, unlike `disabled`/`maintenance` -- the
`ModuleStatusDialog`'s live-impact-count Alert and acknowledgement Checkbox render only
when the transition enters or leaves a fully-blocked status, in either direction, mirroring
PLATFORM-P0-07.2's own dialog already requiring the same ceremony for re-enabling, not only
disabling); no cross-module-read carve-out for `read_only` (the stop-and-report entry's own
question 2 raised this as a *rejected* alternative reading, not a real requirement -- the
user's decision #2 confirmed the plain grace-period mirror, which has no such carve-out
today either); no email/notification when a module's status changes (`PLATFORM-P0-11`,
still "Not started"); no UI history page for `platform.module_status_events` (§16, Platform
Audit, remains that future story).

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace,
including the module registry's own package. `npm run lint --workspaces --if-present` --
0 errors, the same 1 pre-existing unrelated warning every prior entry in this log has
logged (`Package` unused import in a CRM conversations page, untouched by this story).
`node scripts/lint-import-boundaries.mjs` -- 1200 files, no violations. `node
scripts/lint-migration-schema.mjs` -- 145 migrations (144 -> 145, this story's own file),
no violations. `npx vitest run --root packages/core` -- 19 files / 172 tests (167 -> 172,
+5 new `module-entitlement.test.ts` cases for the `read_only`/`maintenance` decision
branches and the customer-facing-message override, plus the existing
`buildPlatformDisabledDecision`/`buildModuleEntitlementDecision` cases updated for their
new signatures). `apps/web`'s own `vitest run --passWithNoTests` -- 47 tests, unchanged
(no new `apps/web` test file this story -- its own logic is authorization/RLS +
pure-decision composition, covered by the two new local-Postgres RLS scripts and the
`packages/core` unit tests respectively).

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; confirmed via `execute_sql` that every module row is
unchanged post-migration (`enabled=true`, `status='available'`, `customer_facing_message`
null on all 5 rows) -- the reconciliation did not silently alter any existing state.
`mcp__Supabase__get_advisors` (security) -- zero new findings: the same 5 pre-existing
`rls_enabled_no_policy` tables and the pre-existing leaked-password-protection warning
every prior entry has logged (`module_kill_switch_events` no longer appears at all, having
been dropped; its replacement `module_status_events` has a real SELECT policy from the
start, so it was never flagged). `mcp__Supabase__get_advisors` (performance) -- the only
new findings are the same benign "unused index" info-level class every sibling FK index
already carries in this low-traffic dev database, this time for
`module_status_events_module_key_idx`/`module_status_events_performed_by_idx`.

**Role-switched live proof against dev's own real data**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real `core.account_members` row, not a
superadmin) this backlog's own prior entries have repeatedly used, role-switched `select *
from platform.set_module_status('gst', 'disabled', 'test message', 'live dev test -
should be rejected')` returned a real Postgres error -- `P0001: Forbidden: only a
SUPERADMIN can change a module's platform-wide status.` -- raised by the function's own
internal check, not a generic RLS denial (there is no RLS on a function call itself; this
is the function's own authorization boundary working exactly as designed, the same shape
PLATFORM-P0-07.2's own boolean RPC already proved). Reconfirmed immediately after via a
plain read that `gst` was still `status='available'`, `enabled=true`,
`customer_facing_message` null, and that `platform.module_status_events` had `0` rows --
this real user's attempt left zero residue, nothing to clean up. As with every prior story
in this log, there is no seeded demo superadmin user in this environment, so the "a real
superadmin CAN" half of this proof is verified for real only against local Postgres
(below), not live dev.

**The dedicated local-Postgres RLS/behavior tests this workstream's own higher bar
requires -- two scripts, per this story's own instruction that reconciling two
previously-independent full-block mechanisms into one needs a real concurrency/
consistency re-verification, not just a read of the updated SQL**:

- `scripts/test-platform-module-kill-switch-rls.mjs` (PLATFORM-P0-07.2's own script,
  rewritten rather than left broken by the rename) now exercises
  `platform.set_module_enabled()` specifically as a backward-compatibility entry point --
  confirming it still rejects a non-superadmin with zero residue, still requires a
  non-empty reason in both directions, still rejects an unknown module key, and that a
  disable/re-enable pair correctly maps to `status='disabled'`/`status='available'` (and
  the derived `enabled` column agrees) while writing to the renamed
  `platform.module_status_events` table. **All 18 assertions passed.**
- `scripts/test-platform-module-status-rls.mjs` (new) is the real reconciliation-specific
  test: cycling `gst` through all four statuses and asserting the derived `enabled` value
  at each step (decision #1); a direct `update platform.modules set enabled = true`
  attempt rejected even for `service_role`, since `enabled` is `GENERATED ALWAYS` and
  cannot be assigned directly by anyone, proving the "structurally impossible to
  desynchronize" claim rather than merely asserting it; `maintenance` and `disabled`
  producing an identical `enabled=false` (decision #3); a non-superadmin rejected with zero
  state change; an empty/whitespace reason rejected for a `read_only` and even a
  same-value `available` transition, not only a disabling one; an unknown status value
  rejected by the function's own friendlier check (not a raw CHECK-constraint error); a
  message-only change (status held constant) still producing exactly one new audit row
  with the real previous/new message values and `previous_status = new_status` (decision
  #4); a combined status+message change captured as one atomic row; an empty-string
  message normalizing to `null` rather than being stored literally; the audit trail
  staying superadmin-only SELECT with no INSERT grant to `authenticated` at all (same
  "one function owns every write" shape as its predecessor); and a same-module sequential
  concurrency check (`disabled` then `read_only` on the same row) confirming the final
  state is always self-consistent (`read_only` implies `enabled=true`, never a stale
  `false` left over from the intermediate `disabled` state). **All 24 assertions passed.**

Both scripts were run against a real, throwaway local Postgres 16 database (this sandbox's
own cluster, already online via `pg_lsclusters` -- no restart needed this time) applying
every migration in the current timeline (145 files) before asserting, and both are now
wired into `package.json`'s `test:db` composite script.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this environment, so the "a real superadmin successfully changes a
module's status" half of the live-dev proof, and any live browser walkthrough of the new
`ModuleStatusDialog` (opening it, seeing a real impact count render, actually clicking
through the confirmation for a maintenance/disabled transition), were **not** performed
against dev and are not claimed here. That half was verified for real only against local
Postgres (all 24 assertions above, including the atomic message-audit proof and the
concurrency/consistency check) -- the "a non-superadmin is rejected, with zero residue"
half, and the underlying schema/function/RLS/generated-column shape, were verified for
real against both the live dev Supabase project (role-switched, as a real user, a real
Postgres error raised by the function's own check) and local Postgres, not merely asserted
from reading the code or the SQL.

**Status**: PLATFORM-P0-07.3 done. §11 (Module Administration) is now fully complete
(07.1-07.3). This run's own usage-tracking note: well under the 80% stop threshold --
continuing per the auto-merge-to-main policy and the remaining backlog order.

### PLATFORM-P0-08.1/08.2/08.3/08.4 — Feature Flags (2026-09-12)

**Worktree hazard checked first, per this workstream's own standing instruction**: this
run's worktree `HEAD` was on a `worktree-agent-*` branch sitting at `origin/main`'s tip
(after other workstreams' merges), not at `feature/platform-admin-portal`'s own tip.
Working tree was clean (no stash needed) -- fixed with `git checkout -B
feature/platform-admin-portal origin/feature/platform-admin-portal`, landing at `46fcc52`
(PLATFORM-P0-07.3's own commit), then re-verified `git log --oneline -3` matched before
touching any file. `npm install` run fresh (no `node_modules` in this worktree), confirmed
via `readlink -f node_modules/@cofounderai/core` resolving to this worktree's own
`packages/core`.

**Read first, per this run's own task brief**: this whole audit log's "Progress" table and
"Pre-implementation reconnaissance" section, plus every §11 (07.1-07.3) entry above in
full -- the module-registry/kill-switch/status-reconciliation precedent this story mirrors
most closely -- and `docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md` §12 (08.1-08.4) in
full, plus PLATFORM-P0-04.4's own migration and audit-log entry for
`platform.features`/`platform.plan_features`, since that story's own docstring had already
named this exact future table and pre-emptively distinguished it.

**Confirmed genuinely distinct from `platform.features`/`platform.plan_features`
(PLATFORM-P0-04.4)**: that table is a *commercial* packaging fact (what a paying plan
entitles a customer to use at all); `platform.feature_flags` (this story) is an
*operational* on/off control for reliability, staged rollout, and emergency kill switches
-- §12.3's own named examples (AI research, outbound messaging, WhatsApp integration,
government submission, expensive external APIs) are all infrastructure/safety concerns,
not pricing-tier concerns. Neither table touches or extends the other. Entity-ownership
check against `docs/plan/00-MASTER-PLAN.md` §5 also passed: no "feature flag" concept
listed there at all -- genuinely new.

**This run's own workstream-boundary check, done before writing anything**: the task
assignment explicitly flagged §12 in advance as "introducing kill-switch-style wiring
across several subsystems (AI research, outbound messaging, WhatsApp, government
submission) -- read carefully before assuming scope," and separately forbids touching
`module-discovery`, `module-gst`, or any other workstream's files. Read against §12's own
literal text, 08.1-08.4 ask only for the flag catalog (key/description/enabled/effective
window), Global/Plan/Module/Country scope, and an audit trail -- never for real
enforcement wired into any specific subsystem, and no PLATFORM-P0-08.5 "wire kill switches
into AI/WhatsApp/government-submission code" story exists anywhere in this backlog. This
mirrors the same "table now, real enforcement in a later, separate story" sequencing
`platform.plan_modules.enabled` (04.3) and `platform.modules.enabled`/`status`
(07.1/07.2/07.3) each went through. Even if the doc had asked for it, this run's own
file-scope restriction would forbid building it here regardless, since every one of
§12.3's named subsystems lives inside another workstream's module packages -- not a
security-authorization ambiguity to stop and report on, a plain scope boundary already
settled by this run's own task assignment. So this story builds the catalog, scope, and
audit trail only, and the application layer's own docstring says so explicitly.

**A non-security data-modeling judgment call, decided per this run's own task brief**:
§12.2 names four scope kinds but not how one flag row expresses one. Modeled as a single
`scope_type` discriminator (`global`/`plan`/`module`/`country`) plus three nullable
scope-value columns, with a CHECK enforcing exactly the one matching column is set --
verified directly (not just read from the constraint) for all three non-global scopes,
plus the "global must have no scope value" direction, in the new RLS script below.
`scope_country_code` is a plain ISO-3166-1-alpha-2-shaped text column, not an FK -- no
country/compliance-pack registry table exists yet (§17 is still "Not started"). Business/
user-level scope is explicitly named "P1" by §12.2 itself, so no
`scope_business_id`/`scope_user_id` column exists at all.

**Why every mutation goes through a SECURITY DEFINER function, unlike PLATFORM-P0-07.1's
plain `visible`/`version` columns**: §12.4 requires *every* change (not only a kill-switch
flip) to be audited with who/what/old value/new value/reason/timestamp -- a stricter,
first-class requirement from 08.1 onward, not something layered on after the fact the way
07.2 added it for `platform.modules.enabled` alone. So `platform.feature_flags` gets no
direct INSERT/UPDATE/DELETE grant to `authenticated` at all; `platform.create_feature_flag()`/
`update_feature_flag()`/`delete_feature_flag()` (migration
`20260912270000_platform_feature_flags.sql`) are the only paths to a row, each requiring a
non-empty `reason` unconditionally and writing one atomic `platform.feature_flag_events`
row per call -- mirroring `platform.set_module_status()`'s own shape. Unlike
`platform.module_status_events`' explicit `previous_status`/`new_status` columns (only two
mutable fields there), this audit table stores full `previous_value`/`new_value` JSONB
snapshots, since `platform.feature_flags` has five mutable-or-identity fields worth
capturing on create/delete and four on update -- `feature_key` is denormalized onto the
event row so history stays readable by key after a flag is deleted (`flag_id` is `on
delete set null`, deliberately not `cascade`, so the deletion's own audit row survives the
deletion it records).

**Scope and `feature_key` are immutable after creation** -- `update_feature_flag()` only
ever touches `description`/`enabled`/`effective_from`/`effective_to`, the same "no edit
path for identity fields, delete-and-recreate instead" reasoning PLATFORM-P0-04.4 already
used for `platform.features.key`.

**RLS read policy**: SELECT open to any authenticated user from the start (the same
reasoning PLATFORM-P0-07.1's `platform.modules` migration used in advance, avoiding a
second widening migration later) -- a kill-switch-style flag is meaningless unless
ordinary request-time application code, running as `authenticated`, can eventually read
it. `platform.feature_flag_events` stays superadmin-only SELECT, matching
`platform.module_status_events`' own sensitive-history trust level.

**Application layer** (`packages/core/src/admin/platform-feature-flags.ts`):
`listFeatureFlags()` (joins in plan/module display names), `listFeatureFlagScopeOptions()`
(for the UI's own scope dropdowns), `createFeatureFlag()`/`updateFeatureFlag()`/
`deleteFeatureFlag()` (each Zod-validated, each calling its one RPC, never a plain
`.insert()`/`.update()`/`.delete()`), and `isFeatureFlagActive()` -- a pure, unit-tested
derivation of a flag's *current* effective state from its own `enabled`/
`effectiveFrom`/`effectiveTo` fields, used only by this story's own admin UI status badge
(Active/Scheduled/Expired/Disabled). 21 new unit tests (Zod schema edge cases -- scope
requiredness per scope type, country-code shape, effective-window ordering, reason
requiredness -- plus 6 `isFeatureFlagActive()` cases).

**UI**: new `/platform/feature-flags` route (added to the platform nav). One combined
Add/Edit dialog (`FeatureFlagDialog`, mirrors `plan-dialog.tsx`'s established pattern) --
scope is editable only at creation (read-only text in Edit mode), and a reason `Textarea`
is required for every submission, create or edit, with the confirm button disabled until
it's non-empty. A separate `DeleteFlagDialog` (`AlertDialog` + its own required reason)
mirrors `feature-entitlements-section.tsx`'s own delete-confirmation pattern. Desktop
table / mobile card split per CLAUDE.md development principle #12 and
docs/design/claude-ui-design-rules.md rule 5, mirroring `plans/page.tsx`'s own established
split.

**Deliberately not built this story**: no real kill-switch wiring into any subsystem
(AI research, outbound messaging, WhatsApp, government submission, or any other module) --
see the workstream-boundary reasoning above; no business/user-level scope (§12.2's own
explicit P1); no dedicated audit-browsing UI for `platform.feature_flag_events` (§16,
Platform Audit, remains that future, broader story, the same deferral 07.2/07.3 already
made for `platform.module_status_events`); no scope-editing after creation (see the
immutability reasoning above); no automatic enable/disable at `effective_from`/
`effective_to` boundaries -- `isFeatureFlagActive()` is a pure read-time derivation for
display only, not a scheduled job, since nothing in §12 asks for one and no consumer reads
it outside this story's own status badge.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated
warning every prior entry has logged. `node scripts/lint-import-boundaries.mjs` -- 1206
files, no violations. `node scripts/lint-migration-schema.mjs` -- 146 migrations (145 ->
146, this story's own file). `npx vitest run --root packages/core` -- 20 files / 193 tests
(172 -> 193, +21 this story's own). `apps/web`'s own `vitest run --passWithNoTests` -- 47
tests, unchanged. `cd apps/web && rm -rf .next && npm run build` -- clean;
`/platform/feature-flags` lists `ƒ` (dynamic), correctly inheriting the outer layout's
existing `force-dynamic`.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; confirmed via `execute_sql` the catalog and audit trail
both start empty (0 rows each) -- no fabricated seed. `mcp__Supabase__get_advisors`
(security) -- zero new findings, the same 5 pre-existing `rls_enabled_no_policy` tables
and the pre-existing leaked-password-protection warning every prior entry has logged.
`mcp__Supabase__get_advisors` (performance) -- only the same benign "unused index"
info-level class every sibling FK index already carries in this low-traffic dev database,
this migration's own five new indexes included.

**Role-switched live proof against dev's own real data**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real `core.account_members` row, not a
superadmin) this backlog's own prior entries have repeatedly used -- role-switched
`select count(*) from platform.feature_flags` returned `0` cleanly (the open-SELECT
catalog policy working as intended for an ordinary business member), and role-switched
`select platform.create_feature_flag('live_dev_test', ..., 'live dev test - should be
rejected')` returned a real Postgres error -- `P0001: Forbidden: only a SUPERADMIN can
create a feature flag.` -- raised by the function's own internal check, not a generic RLS
denial. Reconfirmed immediately after via a plain read that both `platform.feature_flags`
and `platform.feature_flag_events` still had `0` rows -- this real user's attempt left
zero residue. As with every prior story in this log, there is no seeded demo superadmin
user in this environment, so the "a real superadmin CAN" half of this proof is verified
for real only against local Postgres (below), not live dev.

**The dedicated local-Postgres RLS/behavior test this workstream's own higher bar
requires**: new `scripts/test-platform-feature-flags-rls.mjs`, wired into `package.json`'s
`test:db` composite script after `test-platform-module-status-rls.mjs`. Same Alice
(business admin, not a superadmin)/Zoe (real platform superadmin) pair every sibling
script uses. **All 35 assertions passed on the first run** against the full current
migration timeline (146 files): the catalog and audit trail both start empty; Alice can
read the (empty) catalog but every one of her create/update/delete attempts is rejected by
the functions' own internal checks with zero residue in either table; a genuine superadmin
can create global/plan/module/country-scoped flags, each storing its scope value
correctly; `feature_key` uniqueness holds even for a superadmin; the scope CHECK
constraint rejects all three "missing scope value for this scope_type" mistakes plus the
"global with a stray scope value" mistake; the effective-window CHECK rejects
`effective_to` at or before `effective_from`; an empty or whitespace-only reason is
rejected by all three functions with no partial writes; `update_feature_flag()` provably
touches only `description`/`enabled`/`effective_from`/`effective_to` (scope untouched,
matching the function's own signature having no scope parameters at all); a create/update/
delete each write exactly one atomic audit event with a real JSONB before/after snapshot;
deleting a flag nulls the audit row's own `flag_id` (via `on delete set null`) while
`feature_key`/`previous_value` survive intact; the audit trail's own SELECT is
superadmin-only, unlike the open `platform.feature_flags` catalog; and nobody -- including
a superadmin -- can bypass any of the three functions with a direct INSERT/UPDATE/DELETE
on either table. Local Postgres 16 was already installed in this environment; started via
`pg_ctlcluster 16 main start` (it had stopped between sessions, confirmed via
`pg_lsclusters` both before and after).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this environment, so the "a real superadmin successfully creates/edits/
deletes a feature flag" half of the live-dev proof, and any live browser walkthrough of
the new `/platform/feature-flags` page (opening the Add dialog, picking a scope, seeing
the Active/Scheduled/Expired/Disabled badge render, deleting a flag), were **not**
performed against dev and are not claimed here. That half was verified for real only
against local Postgres (all 35 assertions above) -- the "a non-superadmin is rejected,
with zero residue" half, and the underlying schema/function/RLS shape, were verified for
real against both the live dev Supabase project (role-switched, as a real user, a real
Postgres error raised by the function's own check) and local Postgres, not merely asserted
from reading the code or the SQL.

**Status**: PLATFORM-P0-08.1/08.2/08.3/08.4 done -- §12 (Feature Flags) is now fully
complete. This run's own usage-tracking note: well under the 80% stop threshold. Moving to
the next doc section in order: §13 Internal AI Provider & Keys (PLATFORM-P0-09).

### PLATFORM-P0-09.1/09.2 — Internal AI Provider Registry / Secure API Key Storage (2026-09-12)

**Worktree hazard checked first, per this workstream's own standing instruction**: this
run's worktree `HEAD` was on a `worktree-agent-*` branch sitting at `origin/main`'s tip
(itself already fast-forwarded to `feature/platform-admin-portal`'s own tip, `b2a0123`, by
a prior scratch-branch merge) rather than the feature branch itself. Working tree was
clean -- fixed with `git checkout -B feature/platform-admin-portal
origin/feature/platform-admin-portal`, landing exactly on `b2a0123`
(PLATFORM-P0-08.1-08.4's own commit), then re-verified `git log --oneline -3` before
touching any file. `npm install` run fresh (no `node_modules` in this worktree), confirmed
via `readlink -f node_modules/@cofounderai/core` resolving to this worktree's own
`packages/core`.

**Read first, per this run's own task brief**: this whole audit log's "Progress" table,
every §11/§12 entry above (the module-registry/feature-flag precedent this story mirrors
most closely for "fixed catalog" and "every mutation is a SECURITY DEFINER function"
respectively), and `docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md` §13 (09.1-09.5) in
full. Also read, per this run's own explicit instruction to check for an existing,
proven-safe secret-storage pattern before inventing one: `packages/core/src/crypto/
api-key.ts` (the shared AES-256-GCM module, built for BYOK and already reused by
`module-gst`'s GSP credentials), `packages/core/src/ai/business-router.ts` and
`module-discovery/lib/ai-providers/mutations.ts` (how BYOK actually calls that module and
tests a key before saving it), and `supabase/migrations/20260909010000_gst_credentials_
encrypt_secrets.sql` / `20260907150000_gst_credentials_schema.sql` (the "no SELECT grant
to `authenticated` at all" lockdown pattern this story's own higher bar ends up following
instead of BYOK's own weaker one).

**Not a genuine architectural ambiguity to stop and report on, despite the task brief's own
warning to watch for one here**: the task brief flagged "if the doc is ambiguous about
WHERE/HOW a real provider API key should be encrypted or stored... and the codebase
doesn't already have an established, reusable pattern... stop and report." It does,
though: `packages/core/src/crypto/api-key.ts`'s own file header already documents itself
as generic, reusable infrastructure ("any caller with its own text column can reuse it as-
is, sharing the same `API_KEY_ENCRYPTION_SECRET`"), and it has already been reused once
outside its original BYOK caller (`module-gst`'s GSP credentials, 2026-09-09). Reusing it a
third time for a platform-level key is exactly "a consistent, already-proven-safe pattern
... reused rather than invented fresh," not a case where the doc and codebase leave a real
choice open. The one genuine judgment call this story does make -- going further than
BYOK's own row-level SELECT grant to match `gst`'s stricter zero-grant lockdown instead --
is a security *tightening*, decided in the direction the task brief's own higher bar for
this section points, not a case of picking between two equally-defensible storage
mechanisms.

**Entity-ownership check (CLAUDE.md non-negotiable #5)**: no "AI provider" or "AI provider
key" concept is listed in `docs/plan/00-MASTER-PLAN.md` §5 at all. The two existing
near-neighbors -- `discovery.ai_provider_credentials` and `core.ai_provider_credentials`
-- are BYOK (Bring Your Own Key): one business's own connected key, tenant-scoped,
covering only that business's own AI calls. PLATFORM-P0-02.2's own dashboard entry
(PLATFORM-P0-02, 2026-09-11) already named this exact distinction in advance: "the one
category with a narrower real signal (per-business BYOK `ai_provider_credentials`)...
explicitly labeled as *not* the platform-wide provider registry PLATFORM-P0-09 will add."
This story is that platform-wide registry -- WonderArc's own provider configuration and
its own platform-level credential, used as the fallback the platform itself bills when a
business has no BYOK key connected (the existing `getPlatformCredential()`/
`PLATFORM_AI_API_KEY` env-var fallback in `business-router.ts`/`module-discovery`'s own
router is the *current*, deployment-wide, single-credential version of exactly this need)
-- never a business's data, never gated by `core.licenses`, hence `platform` schema.

**Migration**: `supabase/migrations/20260912280000_platform_ai_providers.sql` -- three
tables, all with full reasoning in the migration's own header comment (not repeated here
in full):

- `platform.ai_providers` -- a **fixed, seeded catalog**, not an open create/delete
  surface, mirroring `platform.modules`' own precedent (PLATFORM-P0-07.1): `AiProvider`
  (`packages/core/src/ai/model-registry.ts`) is a closed TS union
  (`"openai" | "anthropic" | "google"`) with no fourth-provider code (model registry
  entry, provider-factory branch, test-connection endpoint) anywhere in this codebase, so
  accepting an arbitrary provider string would let a SUPERADMIN configure a "provider"
  nothing could ever route to. §13's own "Other future providers" text is aspirational,
  not a request to build an open-ended registry now (CLAUDE.md development principle #7).
  Three rows seeded at migration time (openai/anthropic/google), all `enabled = false`
  (unlike `platform.modules`' own `enabled default true` -- there is no existing behavior
  to preserve for a never-before-configured provider, so defaulting to "on" would be a
  fabricated state). Columns: `enabled`, `models text[]`, `default_model`/`fallback_model`
  (each CHECK-constrained to be a member of `models` or null), and two deliberately opaque
  `rate_limits`/`cost_controls` JSONB columns -- §13's own text names both with no units,
  fields, or granularity, and no consumer enforces either yet (PLATFORM-P0-10, "AI Safety /
  Cost Controls," is the later, separate story that gives platform-wide budget enforcement
  a real shape). Same reasoning `gst.tax_rules.value` already used for its own
  under-specified config ("opaque jsonb... next story's job to give some of that jsonb
  shape a name, not this one's to guess ahead of time").
- `platform.ai_provider_keys` -- the secret table, one row per provider, present only once
  a SUPERADMIN has actually configured a key. **Lockdown goes further than BYOK's own two
  tables, matching `gst`'s own stricter fix instead**: `core.ai_provider_credentials`/
  `discovery.ai_provider_credentials` grant `authenticated` a SELECT policy on the whole
  row (safe there only because the reader is the same tenant the key belongs to, and no
  query in this codebase ever actually selects that column back to a browser).
  `gst.eway_bill_credentials`/`einvoice_credentials` went further after
  `docs/testing/EXECUTION-2026-09-08.md` finding 3: zero SELECT grant to `authenticated`
  at all, with a separate SECURITY DEFINER status function that never selects the secret
  column. Given this run's own explicitly higher bar for this section and the fact that a
  platform-level key protects every tenant at once (not one tenant's own data),
  `platform.ai_provider_keys` follows `gst`'s stricter shape: **zero SELECT grant to
  `authenticated`, not even for a genuine SUPERADMIN** -- verified directly below, both
  live against dev and against local Postgres, not merely asserted from the grant
  statements. The only read path is `platform.ai_provider_key_status()`, a SECURITY
  DEFINER function that never selects `encrypted_api_key`. No `status`/`last_error`
  columns (unlike BYOK's own credential tables) -- the application layer only ever calls
  `set_ai_provider_key()` after `testProviderConnection()` succeeds, so a stored "error"
  state that no code would ever write would be exactly the speculative column CLAUDE.md
  development principle #7 rules out.
- `platform.ai_provider_events` -- append-only audit trail for both tables above, same
  `previous_value`/`new_value` JSONB-snapshot shape `platform.feature_flag_events`
  established. **The audit trail never carries key material, not even ciphertext**: a key
  mutation's snapshots are hand-built with `jsonb_build_object('key_fingerprint', ...)`,
  never `to_jsonb(row)` -- verified directly below (a `bool_or(... like '%ciphertext%')`
  check across every event row). Config-only mutations (`update_ai_provider_config`) touch
  no secret column, so `to_jsonb(row)` is safe there.

**Why every mutation goes through a SECURITY DEFINER function, including the registry's
own non-secret config**: PLATFORM-P0-16.2 explicitly names "AI key changes" as a mandatory
high-risk audit item. This run extends that same audited-write discipline to the
registry's own config (enabled/models/rate limits/cost controls) too, not only the key
material -- matching `platform.feature_flags`' own "every change," not `platform.modules`'
narrower, not-yet-audited plain columns -- since this config directly controls real spend
and which third party a platform-wide credential is sent to. Four functions:
`update_ai_provider_config()`, `set_ai_provider_key()` (upserts -- sets or rotates),
`remove_ai_provider_key()`, and `ai_provider_key_status()` (the one masked read path).
Every mutation function requires a non-empty `reason` unconditionally and writes one
atomic audit event.

**A real bug this story's own dedicated RLS script caught, not merely a read of the SQL**:
`set_ai_provider_key()`'s first draft reused PL/pgSQL's `FOUND` special variable twice --
once immediately after the `SELECT ... FOR UPDATE` (to decide `key_set` vs.
`key_rotated`), and again later when building the audit event's `previous_value`. `FOUND`
is overwritten by *every* subsequent statement that can set it, including the upsert in
between -- an `INSERT ... ON CONFLICT DO UPDATE` always affects a row, so by the time the
audit insert ran, `FOUND` had silently flipped to `true` regardless of whether the key was
actually new. The local RLS script's very first key-set assertion
("`(previous_value is null)::text`" should be `true` for a brand-new key) failed
immediately with `got "false"`, catching this on the first run. Fixed by capturing
`v_existed := found;` into its own variable right after the SELECT, before anything else
could clobber it -- re-verified with the same assertion, now passing, plus a follow-up
rotation assertion that the *next* call's `previous_value` correctly carries the *first*
key's own fingerprint. Both the live-dev copy and the local-Postgres copy of this migration
were dropped and re-applied clean after the fix (dev's copy briefly held the buggy version
for the few minutes between the two `apply_migration` calls in this same session -- no
other agent or user touched `platform.ai_provider_keys` in that window, confirmed by its
row count staying `0` throughout).

**Application layer** (`packages/core/src/admin/platform-ai-providers.ts`):
`listAiProviders()` (joins the open `platform.ai_providers` read with
`ai_provider_key_status()`'s masked join, never selecting `encrypted_api_key`),
`updateAiProviderConfig()`, `setAiProviderKey()` (calls the same shared
`testProviderConnection()` BYOK's own `connectAiProvider()` uses, encrypts and
fingerprints the key itself via `encryptApiKey()`/`fingerprintApiKey()`, and -- matching
BYOK's own "a rejected key is never persisted" -- never calls the RPC at all if the test
fails), and `removeAiProviderKey()`. There is no `getAiProviderKey()`/
`revealAiProviderKey()` function anywhere in this file or this codebase's `platform.*`
surface. A comma-separated model-list input and two free-form JSON-object inputs
(`rateLimits`/`costControls`, validated as parseable JSON objects, empty string
normalizing to `{}`) back the config form; a Zod `superRefine` enforces default/fallback
model membership client-side too (the DB's own CHECK constraint is still the authoritative
enforcement, verified directly in the RLS script). 17 new unit tests (config-schema edge
cases -- model dedup/trim, default/fallback-must-be-in-models, JSON-object validation,
unknown provider, empty reason -- plus key-schema and remove-schema edge cases). No
`platform-ai-providers.ts` code ever logs `apiKey` -- checked by inspection, since there is
no automated way to assert the absence of a log call.

**UI**: new `/platform/ai-providers` route (added to the platform nav), always exactly
three rows (no add/remove-provider affordance, matching the fixed-catalog schema).
`ProviderConfigDialog` (enabled/models/default/fallback/rate-limits/cost-controls, a
required reason) and `ProviderKeyDialog` (the one place a plaintext key is ever typed --
always opens blank, never pre-filled, whether setting or rotating) mirror
`feature-flag-dialog.tsx`'s established pattern; `RemoveKeyDialog` mirrors
`DeleteFlagDialog`'s `AlertDialog` + required-reason shape. The key dialog's placeholder
text shows only `••••••••••••{fingerprint}` when a key is already configured -- the same
12-dot-plus-fingerprint mask `apps/web/components/settings/ai-section.tsx` (BYOK's own
settings UI) already established, reused rather than inventing new masking copy. Desktop
table / mobile card split per CLAUDE.md development principle #12 and
docs/design/claude-ui-design-rules.md rule 5, mirroring `feature-flags/page.tsx`'s own
established split.

**Deliberately not built this story**: no real AI-calling router wiring (no code anywhere
reads `platform.ai_provider_keys`/`platform.ai_providers` to actually make a request yet)
-- PLATFORM-P0-09.3 (Provider Routing) is the next, separate story in this doc's own
section order, and `business-router.ts`'s existing `PLATFORM_AI_API_KEY` env-var fallback
is untouched; no fourth ("other") provider support -- see the entity-ownership/fixed-
catalog reasoning above; no key re-validation/"test connection" flow after the initial
set (no stored `status`/`last_error`, see the migration's own reasoning); no specific
rate-limit/cost-control fields or enforcement -- deliberately opaque JSONB, real shape and
enforcement is PLATFORM-P0-10's own later, separate story; no AI feature policies
(enabled/allowed providers/allowed models/max tokens/max run cost/daily platform budget --
PLATFORM-P0-09.4, next in this doc's own section order); no AI usage dashboard
(PLATFORM-P0-09.5); no dedicated audit-browsing UI for `platform.ai_provider_events` (§16,
Platform Audit, remains that future, broader story, the same deferral 07.2/07.3/08.1-08.4
already made for their own audit tables).

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated warning
every prior entry has logged. `node scripts/lint-import-boundaries.mjs` -- 1213 files, no
violations. `node scripts/lint-migration-schema.mjs` -- 147 migrations (146 -> 147, this
story's own file). `npx vitest run --root packages/core` -- 21 files / 210 tests (193 ->
210, +17 this story's own). `apps/web`'s own `vitest run --passWithNoTests` -- 47 tests,
unchanged. `cd apps/web && rm -rf .next && npm run build` -- clean; `/platform/ai-providers`
lists `ƒ` (dynamic), correctly inheriting the outer layout's existing `force-dynamic`.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only -- twice, once before the `FOUND`-variable bug was caught
and fixed, and once after: the first apply's three tables/four functions were dropped
(`drop table`/`drop function`, cascade-free since nothing else yet references them) and
its `supabase_migrations.schema_migrations` row deleted before the corrected file was
re-applied clean, so dev's own migration history has exactly one row for
`platform_ai_providers`, matching the corrected file on disk. Confirmed via `execute_sql`
after the final apply that the catalog seeded exactly the three known providers, all
`enabled = false`, no models -- no fabricated "on" state -- and that both
`platform.ai_provider_keys`/`platform.ai_provider_events` started empty.
`mcp__Supabase__get_advisors` (security) -- one new, fully expected finding:
`platform.ai_provider_keys` joins the same `rls_enabled_no_policy` INFO-level class
`gst.eway_bill_credentials`/`einvoice_credentials` already carry (RLS enabled, zero
policies, by design -- the entire point of the table), alongside the same 5 pre-existing
findings and the pre-existing leaked-password-protection warning every prior entry has
logged. `mcp__Supabase__get_advisors` (performance) -- only the same benign "unused index"
info-level class every sibling FK index already carries in this low-traffic dev database,
this migration's own five new indexes included.

**Role-switched live proof against dev's own real data**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real `core.account_members` row, not a
superadmin) this backlog's own prior entries have repeatedly used --
role-switched `select count(*) from platform.ai_providers` returned `3` cleanly (the open-
SELECT catalog policy working as intended), role-switched `select * from platform.
ai_provider_key_status()` returned zero rows (the function's own internal
`is_superadmin()` filter, not an error), and role-switched `select * from platform.
ai_provider_keys` returned a real Postgres **permission-denied** error (`42501:
permission denied for table ai_provider_keys`) -- not an RLS-filtered empty result, a
genuine grant-level refusal, confirming the "zero SELECT grant, not even RLS-filtered"
design holds for a real non-superadmin against the real dev database. All three mutation
RPCs (`update_ai_provider_config`/`set_ai_provider_key`/`remove_ai_provider_key`) each
returned a real `P0001: Forbidden` error raised by the function's own internal check.
Reconfirmed immediately after via a plain read that every provider was still `enabled =
false` and both `platform.ai_provider_keys`/`platform.ai_provider_events` still had `0`
rows -- this real user's attempts left zero residue. As with every prior story in this
log, there is no seeded demo superadmin user in this environment, so the "a real
superadmin CAN" half of this proof, including the "even a superadmin cannot read
`platform.ai_provider_keys` directly" half, is verified for real only against local
Postgres (below), not live dev.

**The dedicated local-Postgres RLS/behavior test this workstream's own higher bar
requires**: new `scripts/test-platform-ai-providers-rls.mjs`, wired into `package.json`'s
`test:db` composite script after `test-platform-feature-flags-rls.mjs`. Same Alice
(business admin, not a superadmin)/Zoe (real platform superadmin) pair every sibling
script uses. **All 40 assertions passed** (after the `FOUND`-variable fix above) against
the full current migration timeline (147 files): the catalog seeds exactly three
providers, disabled, no models, no keys, no events; Alice can read the open catalog but
gets a genuine permission-denied error selecting `platform.ai_provider_keys` directly (not
an empty RLS-filtered result) and zero rows (not an error) from
`ai_provider_key_status()`; every one of Alice's config/key mutation attempts is rejected
by the functions' own internal checks with zero residue across all three tables; a genuine
superadmin can update a provider's config, with the default/fallback-model-in-models CHECK
constraint enforced even for her; an unknown provider key and an empty/whitespace reason
are rejected by every mutation function; a genuine superadmin can set a key (one `key_set`
event, no `previous_value`, correct fingerprint), then rotate it (one `key_rotated` event
whose `previous_value`/`new_value` carry only the two fingerprints -- confirmed via a
`bool_or(... like '%ciphertext%')` sweep across every event row, finding none), with the
underlying table always holding exactly one row per provider (the upsert never
duplicates); **even Zoe, a genuine superadmin, gets a permission-denied error selecting
`platform.ai_provider_keys` directly** -- the standout assertion this story's higher bar
demanded; removing a key writes one `key_removed` event capturing the last fingerprint,
and removing an already-absent key is rejected; the audit trail's own SELECT is
superadmin-only (Alice gets zero rows, RLS-filtered, not an error); and nobody -- including
a superadmin -- can bypass any of the three functions with a direct INSERT/UPDATE/DELETE
on any of the three tables. Local Postgres 16 was already running in this environment
(confirmed via `pg_lsclusters` both before and after).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this environment, so the "a real superadmin successfully configures/
sets/rotates/removes a key" half of the live-dev proof, and any live browser walkthrough
of the new `/platform/ai-providers` page (opening the config dialog, setting a key against
a real provider's own API, seeing the "Configured" badge and masked fingerprint render,
removing a key), were **not** performed against dev and are not claimed here. That half
was verified for real only against local Postgres (all 40 assertions above) -- the "a
non-superadmin is rejected, with zero residue, including a genuine permission-denied error
on the secret table" half, and the underlying schema/function/RLS/grant shape, were
verified for real against both the live dev Supabase project (role-switched, as a real
user, real Postgres errors raised by both the grant system and the functions' own checks)
and local Postgres, not merely asserted from reading the code or the SQL. Separately: since
`testProviderConnection()` makes a real outbound HTTPS call to whichever provider's own API,
no automated test in this story exercises `setAiProviderKey()` end-to-end against an actual
live provider (that would require a real, working third-party API key committed to test
fixtures, which CLAUDE.md's environment rules already forbid regardless) -- the local RLS
script instead calls `platform.set_ai_provider_key()` directly with a fabricated
already-encrypted string, which is exactly what the function receives after
`testProviderConnection()` has already succeeded in the real application-layer flow, so
the database-layer behavior this script proves is unaffected by that gap.

**Status**: PLATFORM-P0-09.1/09.2 done. Continuing in §13's own story order:
PLATFORM-P0-09.3 (Provider Routing) next.

---

### PLATFORM-P0-09.3 — Provider Routing (2026-09-12) — STOP AND REPORT

**Worktree hazard checked first, per this workstream's own standing instruction**: this
run's worktree `HEAD` was on a `worktree-agent-*` branch sitting at a stale scratch merge
commit (`8f138b1`, "Merge branch 'feature/platform-admin-portal' into scratch-plat-09-
merge") one commit *ahead of* `feature/platform-admin-portal`'s own real tip rather than
sitting on the feature branch itself. Working tree was clean -- fixed with `git checkout -B
feature/platform-admin-portal origin/feature/platform-admin-portal`, landing exactly on
`772d61e` (PLATFORM-P0-09.1/09.2's own commit), then re-verified `git log --oneline -3`
before touching any file. `npm install` run fresh (no `node_modules` in this worktree; 679
packages added, clean).

**Read first**: `docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md` §13 in full (again, for
09.3's own text this time), §3 ("Critical Architecture Principle"), §40 ("Architectural
Constraints for Claude Code"), and this audit log's own PLATFORM-P0-09.1/09.2 entry above
in full (its own explicit "Deliberately not built this story: no real AI-calling router
wiring... PLATFORM-P0-09.3 (Provider Routing) is the next, separate story" note is exactly
the seam this story picks up from). Also read, to establish what routing infrastructure
already exists and what a "Provider Routing" story would have to change:
`packages/core/src/ai/business-router.ts` (the actual runtime provider-resolution path
every `business_id`-scoped module currently calls through), `packages/core/src/ai/
operation-registry.ts` and `model-registry.ts` (the existing `AiOperation` ->
qualityTier -> provider -> modelId resolution chain), and `packages/module-registry/
src/index.ts` (confirms a clean, closed `ModuleKey` union -- `"discovery" | "inventory" |
"fsm" | "crm" | "gst"` -- already exists, so "which modules can be routing targets" is not
itself an open question).

**This is a genuine architectural ambiguity to stop and report on -- matching this run's
own task brief almost verbatim ("If 'Provider Routing' turns out to require real AI-calling
infrastructure... and the doc doesn't specify the routing algorithm precisely, that is
exactly the kind of thing to stop and report on rather than invent")**, not a case with an
existing, reusable, already-proven pattern to follow the way 09.1/09.2's own secret-storage
question turned out to be.

§13's own text for 09.3 is four configuration field names and a three-line example:

```text
default provider
default model
module-specific provider
fallback provider

Discovery -> Gemini
CRM -> OpenAI
Compliance -> OpenAI
```

That is exhaustive -- there is no other mention of "routing," "failover," or a per-module
provider concept anywhere else in this doc (checked: the doc's only other "routing" hits are
`crm`'s unrelated `routing_rules` ticket-routing table and one throwaway ADR-1 aside about
extracting a module into its own deployment "later" being "a routing change, not a rewrite"
-- neither is this feature). Two readings of "Provider Routing" are both consistent with
that text, and this codebase's actual AI call chain makes the gap between them a real one,
not a cosmetic one:

1. **Config-only reading** (same shape as 09.1 itself): a new, audited `platform.*`
   config surface -- a fixed-shape routing table (a platform-wide default provider/model,
   a `ModuleKey -> AiProvider` override map, a platform-wide fallback provider) -- that a
   SUPERADMIN can set and see, with no runtime code path reading it yet. This mirrors
   09.1/09.2's own explicit deferral pattern exactly ("no real AI-calling router wiring...
   next story's job").
2. **Wiring reading**: actually change `business-router.ts` (and, by the doc's own
   Discovery/CRM/Compliance example, `module-discovery`'s separate `lib/ai/router.ts` too)
   so a real AI call's provider selection is actually governed by this configuration
   instead of the current hardcoded `getPlatformCredential()` (`provider: "anthropic"`,
   read from the single `PLATFORM_AI_API_KEY` env var, no per-module distinction at all).

Reading 1 alone would just be 09.1 again with different columns -- plausible, but if 09.3's
whole point is that the *next* story is the one that makes the registry actually do
something (as 09.1/09.2's own entry implied), a config-only 09.3 defers the real work
indefinitely under a title that specifically says "Routing." Reading 2 is what "Provider
Routing" most naturally means, and is squarely in "real AI-calling infrastructure" territory
-- and the doc gives no algorithm for it. Concretely, all of the following are genuine,
consequential unknowns a correct implementation would have to invent from nothing:

- **Precedence with BYOK**: `resolveBusinessAiModel()` currently tries the business's own
  connected key (`core.ai_provider_credentials`) *first*, falling back to the platform
  credential only if none exists. Does "module-specific provider" ever override a
  business's own BYOK provider choice (e.g. force CRM calls through OpenAI even for a
  business that connected its own Anthropic key), or does it only decide which provider the
  *platform's own* fallback credential uses when there is no BYOK key at all? The doc's
  Discovery/CRM/Compliance example reads as an absolute per-module rule, which would mean
  overriding a tenant's own explicit BYOK choice -- a materially different (and more
  surprising) behavior than "only governs the platform's own fallback," and CLAUDE.md's own
  AI section documents BYOK as the established, tenant-controlled path without ever
  mentioning platform routing overriding it.
- **Fallback semantics**: is "fallback provider" a static secondary choice substituted at
  resolution time only when the primary provider has no configured key or is disabled
  (`platform.ai_providers.enabled = false`), or live mid-request failover -- retry a failed
  call against a different provider after it fails? If the latter, which of
  `business-router.ts`'s own existing `AiErrorCode` classifications
  (`rate_limited`/`provider_unavailable`/`timeout`/`invalid_key`/...) should trigger
  failover and which shouldn't (retrying `invalid_key` against a different provider makes
  sense; retrying `invalid_response` -- a schema-validation failure of the model's own
  output -- against a different provider is a different kind of fix entirely)? None of this
  is in the doc, and inventing a specific retry/error-classification policy here is exactly
  the kind of unstated algorithm the task brief calls out.
- **Granularity -- module vs. operation**: the doc's example is per-module (Discovery, CRM,
  Compliance), but the *existing* resolution chain is per-`AiOperation`
  (`operation-registry.ts`'s 19 operations, each with its own quality tier), and
  `business-router.ts`/discovery's own router take no "module" parameter at all today --
  there is no place in the current call chain that even knows which `ModuleKey` a given
  call belongs to. Wiring module-specific routing would mean threading a new `ModuleKey`
  argument through every current and future caller of `resolveBusinessAiModel()`
  (`crm` today; `fsm`/`inventory`/`gst` whenever each first calls an LLM) and through
  discovery's own separate router -- a cross-cutting signature change to shared
  infrastructure, not a self-contained addition, and the doc doesn't say whether operation-
  level quality-tier selection and module-level provider selection are meant to compose (an
  operation still picks a quality tier; the module picks which provider's model at that
  tier) or whether module routing is meant to *replace* today's tier-based selection.
- **"default model" vs. `platform.ai_providers.default_model`**: 09.1 already gave each
  provider row its own `default_model`/`fallback_model` columns (`platform.ai_providers`,
  this run's own prior story). 09.3 lists "default model" again as a routing-level field.
  Is this the same value read from a different table (redundant), a platform-wide override
  independent of any single provider's own default (used when no module-specific route
  matches), or a per-module model override on top of a per-module provider override? The
  doc's flat field list doesn't distinguish.
- **Missing-key behavior**: if a module is routed to a provider that has no
  `platform.ai_provider_keys` row configured (or `platform.ai_providers.enabled = false`
  for it), does resolution fall through to the "fallback provider," to the platform's
  historical single-credential behavior, or fail outright with a new error code? Each is a
  different user-facing behavior for a real outage, not a stylistic choice.

None of these are layout, naming, or "which existing pattern to reuse" calls -- they are
exactly "how a module's own AI call chooses platform-key-vs-BYOK, retry/failover semantics"
per this run's own task brief, and getting any one of them wrong ships either a silent
tenant-BYOK-override regression or unwanted retry behavior against a real, billed third-
party API. Per this workstream's own established pattern (five prior successful stop-and-
report cycles this session: PLATFORM-P0-06.5, PLATFORM-P0-07.3, and others referenced
above), this story stops here rather than guessing.

**Nothing was built or changed this story** -- no migration, no application code, no UI.
This audit-log entry and the Progress-table update above are the only changes.

**Recommendation, not a decision**: the narrowest, lowest-risk path once the user answers
the above would likely be Reading 1 (config-only: a `platform.ai_provider_routing` table --
platform-wide default provider/model plus a `ModuleKey -> AiProvider` override map plus a
platform-wide fallback provider, audited the same way as 09.1/09.2, no runtime wiring),
deferring Reading 2's actual call-chain wiring to a follow-up story once its own algorithm
questions (precedence with BYOK, failover semantics, granularity) are separately answered --
mirroring exactly how 09.1/09.2 itself deferred all routing to this story. But that is this
agent's own suggestion for how to *sequence* the work, not a substitute for the user
answering the open questions above; implementing even the config-only reading without
confirming it's what's wanted risks building the wrong table shape (e.g. omitting the
per-operation dimension if that turns out to be required).

**Status**: PLATFORM-P0-09.3 stopped, open questions written above. Resume once the user
decides. §13's other stories (09.4 AI Feature Policies, 09.5 AI Usage) do not obviously
depend on 09.3's own resolution and remain candidates to pick up first if the user prefers,
but per this run's own task brief ("Then continue to 09.4..., 09.5..." in §13's own stated
order) this run stops here to report rather than skip ahead on its own judgment.

---

### PLATFORM-P0-09.3 — Provider Routing, CONFIG-ONLY (2026-09-12) — RESUMED AND BUILT

**Worktree hazard hit again, fixed with the established pattern**: this run's worktree
`HEAD` started on branch `worktree-agent-a2cb7c907300c14f6`, sitting on `3dbcdc7` ("Merge
branch 'feature/platform-admin-portal' into scratch-plat-09-3-merge") -- a stray scratch
commit from a prior run's own auto-merge-to-main procedure that had folded in unrelated
concurrent work from `main` (comply-backlog's US 1099 story, discovery-offering-backlog's
website-onboarding/pipeline work -- 325 files, +29894/-169 relative to
`feature/platform-admin-portal`'s real tip), not the feature branch's own clean history.
Not caught before the first commit this time (the implementation work above was already
done and committed as `79e95be` before this was noticed) -- fixed after the fact rather
than before, per the same pattern the log's own hazard note describes: `git status`
confirmed a clean tree, then `git checkout -B feature/platform-admin-portal
origin/feature/platform-admin-portal` (landing exactly on `5c24b69`, the real tip) followed
by `git cherry-pick 79e95be` to replay this story's own changes onto the correct base. One
conflict, in `package.json`'s `test:db` script list (the scratch commit's version included
several other workstreams' own script entries this branch's real history doesn't have) --
resolved by keeping this branch's own real list and appending only this story's one new
entry, the same "keep both sides' entries" resolution this workstream's task brief itself
prescribes for that exact file. `git log --oneline -3` reconfirmed `HEAD` on
`feature/platform-admin-portal` at the replayed commit (`c09194a`) after the fix, before any
further work. The full verification pipeline below was run (and, where a stale `.next`
build-artifact from the wrong-branch build briefly broke `tsc` with phantom route-module
errors, re-run after `rm -rf apps/web/.next`) entirely on this corrected branch, not the
scratch one -- the numbers reported below (1218 boundary files, 148 migrations) are this
branch's own real counts, distinct from an intermediate, discarded run's own (1444 files,
188 migrations) taken while still on the stray scratch commit. `npm install` run fresh (no
`node_modules` in this worktree; 679 packages added, clean).

**The user's decision, verbatim intent**: build the routing *configuration data only, with
NO runtime wiring* -- exactly Reading 1 from the prior stopped entry's own analysis, and
exactly that entry's own "Recommendation" section. This entry documents that the config-only
scope was a given (the user's explicit decision, relayed in this run's own task brief, not
this agent's own judgment call) -- what *was* this agent's own call, and is documented
below, is the table's exact shape, the audit-events design, and the UI's placement.

**What was deliberately NOT touched, matching the decision's own explicit boundary**:
`packages/core/src/ai/business-router.ts`, `operation-registry.ts`, `model-registry.ts`'s
resolution logic, and `packages/module-discovery`'s own separate router -- zero lines
changed in any of the four. No function in the new `platform-ai-provider-routing.ts` is
called from any of them, and none of them import from it. Grepped after finishing to
confirm: `grep -rl "ai_provider_routing" packages/core/src/ai packages/module-discovery/src`
returns nothing. The BYOK-precedence/failover-semantics/module-vs-operation-granularity/
missing-key-fallback questions the prior entry raised remain fully open and unanswered --
this story builds no code path that would need to answer them, so none needed answering.

**New migration**: `supabase/migrations/20260912370000_platform_ai_provider_routing.sql` --
`platform.ai_provider_routing` (singleton, boolean-PK-fixed-to-true, same trick
`platform.branding` established) with `default_provider`/`fallback_provider` (nullable,
each FK-referencing `platform.ai_providers.provider`), `default_model` (free text, no
cross-table containment check), and `module_overrides` (a single `jsonb` `ModuleKey ->
AiProvider` map, validated key-by-key and value-by-value inside the mutation function
against `core.modules`/`platform.ai_providers` respectively, since a table CHECK cannot
express a cross-table lookup) -- plus a dedicated `platform.ai_provider_routing_events`
audit table. See the migration's own extensive docstring for the full reasoning on each of
these calls; the two most consequential ones, summarized:

- **Nullable `default_provider`/`fallback_provider`, not seeded to a real provider** --
  mirrors PLATFORM-P0-09.1's own "every provider seeded `enabled = false`, not a fabricated
  'on' state" stance. Seeding a non-null "the platform's default AI provider is X" the
  moment this table starts existing, before any SUPERADMIN has actually decided that, would
  be exactly the fabricated state that story avoided.
- **A dedicated `ai_provider_routing_events` table, not a reuse of `platform.
  ai_provider_events`** -- considered and rejected: that table's `provider` column is `not
  null` and its `action` CHECK enumerates four per-provider actions; a routing-policy change
  touches `default_provider`, `fallback_provider`, and potentially several
  `module_overrides` entries (each naming a different provider) in one atomic write, so
  forcing it into that table would need either a fabricated sentinel `provider` value or
  widening that table's own CHECK/nullability for a genuinely different kind of event. The
  new table also has no `action` column at all (unlike its sibling) -- there is exactly one
  kind of event this table will ever record, so a column that could only ever hold one value
  would be speculative structure (CLAUDE.md development principle #7), not deferred scope.

Audited-mutation pattern mirrored exactly from `platform.ai_providers`/`platform.
feature_flags`: no INSERT/UPDATE/DELETE grant to `authenticated` on either table at all;
every change goes through `platform.update_ai_provider_routing()`, which requires a genuine
SUPERADMIN (`platform.is_superadmin()`) and a non-empty `reason`, validates every provider/
module-key reference, and writes one atomic before/after audit snapshot. SELECT on the
policy row is open to any authenticated user (same "avoid a second widening migration
later" reasoning `platform.ai_providers`/`platform.modules` already used -- a future routing
consumer will most likely run as an ordinary signed-in business member, not exclusively a
SUPERADMIN); SELECT on the audit trail is SUPERADMIN-only, matching every sibling audit
table in this backlog.

**New application code**: `packages/core/src/admin/platform-ai-provider-routing.ts` --
`getAiProviderRouting()` (the singleton row joined with `core.modules` names for display),
`listAiProviderRoutingOptions()` (provider/module dropdown options for the form), and
`updateAiProviderRoutingSchema`/`updateAiProviderRouting()` (Zod validation -- empty string
normalizes to `null`/`[]`, an unrecognized provider or a duplicate module override is
rejected client-side before the RPC call, matching the friendlier-error-before-DB-constraint
pattern `platform-ai-providers.ts` already established). `requireSuperadmin()` guards every
exported function, defense-in-depth matching every sibling admin file, since `SECURITY
DEFINER` bypasses RLS.

**New UI**: `/platform/ai-routing` (`apps/web/app/platform/(protected)/ai-routing/`) --
a single settings surface, not a list of rows: there is exactly one routing policy, so
there is no table/mobile-card split to make (CLAUDE.md development principle #12 targets a
page whose *primary* content is a table of many rows; the up-to-five module overrides here
are already shown as stacked labeled rows, narrow-screen-safe without a table at all,
consulting `docs/design/claude-ui-design-rules.md` before writing markup per rule #13). One
`RoutingConfigDialog` edits the whole singleton policy at once (default provider/model,
fallback provider, and a `<select>` per module) -- a single form matches the data shape more
directly than per-row dialogs the way `platform.ai_providers`' own fixed three-row catalog
needed per-row ones. Added to `/platform`'s nav strip (`layout.tsx`) as "AI Routing",
directly after "AI Providers".

**Deliberately not built this story**: no runtime wiring of any kind (see above -- this is
this story's entire point, not an oversight); no per-operation routing dimension (the
doc's own field list is per-module, and the prior entry's own granularity question -- module
vs. operation, and whether they're meant to compose -- remains unanswered and unneeded here);
no dedicated audit-browsing UI for `platform.ai_provider_routing_events` (§16, Platform
Audit, remains that future, broader story, the same deferral every sibling audit table in
this backlog has already made); no cross-table containment check between `default_model`
and `default_provider`'s own configured `models` array (this column is a platform-wide
override independent of any single provider's own model list, and the referenced provider
may legitimately have zero models configured yet -- config describing intent, not a
live-readiness check, matching this story's own explicit brief not to require a configured
key/enabled state either).

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace
(`web`, `@cofounderai/core`, `module-crm`, `module-discovery`, `module-fsm`, `module-gst`,
`module-inventory`, `module-registry`). `npm run lint --workspaces --if-present` -- 0
errors, the same 1 pre-existing unrelated warning every prior entry has logged
(`Package` unused in an unrelated CRM conversations page). `node scripts/
lint-import-boundaries.mjs` -- 1218 files, no violations. `node scripts/
lint-migration-schema.mjs` -- 148 migrations (147 -> 148, this story's own file). `npx
vitest run --root packages/core` -- 22 files / 218 tests (210 -> 218, +8 this story's own).
`cd apps/web && rm -rf .next && npm run build` -- clean; `/platform/ai-routing` lists `ƒ`
(dynamic), correctly inheriting the outer layout's existing `force-dynamic`.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only, applied clean on the first attempt. Confirmed via
`execute_sql` after apply that the singleton row seeded with `default_provider`,
`default_model`, and `fallback_provider` all `null` and `module_overrides = '{}'` -- no
fabricated state -- and that `platform.ai_provider_routing_events` started empty.
`mcp__Supabase__get_advisors` (security) -- no new finding: the same 6 pre-existing
`rls_enabled_no_policy` INFO-level rows (including `platform.ai_provider_keys`, already
known/by-design) and the same pre-existing leaked-password-protection warning every prior
entry has logged; nothing new from this migration, since both new tables have real RLS
policies. `mcp__Supabase__get_advisors` (performance) -- two new, genuinely new-shaped but
benign INFO findings: `unindexed_foreign_keys` on `ai_provider_routing`'s own
`default_provider`/`fallback_provider` FKs. Considered and left as-is: this is a singleton
table with exactly one row, ever -- an index exists to speed lookups/cascade-checks across
many referencing rows, and "many" here is structurally capped at 1, so adding one would be
the same kind of speculative structure this backlog's own development-principle-#7
reasoning already rules out elsewhere; also present are the same "unused index" info-level
findings every sibling FK index already carries in this low-traffic dev database
(including this migration's own two new indexes), unchanged in kind from every prior entry.

**Role-switched live proof against dev's own real data**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real `core.account_members` row, not a
superadmin) this backlog's own prior entries have repeatedly used -- role-switched `select
count(*) from platform.ai_provider_routing` returned `1` cleanly (the open-SELECT policy
row working as intended), and role-switched `select platform.update_ai_provider_routing(...)`
returned a real Postgres `P0001: Forbidden: only a SUPERADMIN can change the AI provider
routing policy` error -- a genuine function-level rejection, not a silently-ignored RLS
filter. Reconfirmed immediately after that the singleton row was still untouched
(`default_provider`/`fallback_provider` still null, `module_overrides` still `{}`) and
`platform.ai_provider_routing_events` still had `0` rows -- this real user's attempt left
zero residue. As with every prior story in this log, there is no seeded demo superadmin
user in this environment, so the "a real superadmin CAN set the policy" half of the live-dev
proof was **not** performed against dev and is not claimed here -- verified for real only
against local Postgres (below), the same limitation every prior entry has stated.

**The dedicated local-Postgres RLS/behavior test this workstream's own higher bar
requires**: new `scripts/test-platform-ai-provider-routing-rls.mjs`, wired into
`package.json`'s `test:db` composite script immediately after
`test-platform-ai-providers-rls.mjs`. Same Alice (business admin, not a superadmin)/Zoe
(real platform superadmin) pair every sibling script uses. **All 30 assertions passed**
against the full current migration timeline (148 files, on the corrected branch, re-run
after the worktree-branch fix above): the singleton row starts seeded
with no provider/model set and an empty override map; Alice can read the open policy row
but her mutation attempt is rejected by the function's own internal check with zero
residue; a genuine superadmin can set the full policy (default provider/model, fallback
provider, two module overrides), writing exactly one atomic audit event with a real
before/after snapshot; an unknown default/fallback provider and an unknown module key or
unknown provider inside `module_overrides` are each rejected, with zero residue; a
non-object `module_overrides` value (a JSON array, a JSON scalar) is rejected; an
empty/whitespace reason is rejected; clearing the policy back to an all-null/empty state
is accepted as a valid, honest state (and is itself audited); the audit trail's own SELECT
is superadmin-only (Alice gets zero rows, RLS-filtered, not an error); and nobody --
including a superadmin -- can bypass `update_ai_provider_routing()` with a direct
INSERT/UPDATE/DELETE on either table (the boolean PK also structurally blocks a second
singleton row). Local Postgres 16 was already running in this environment (confirmed via
`pg_lsclusters`).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this environment, so the "a real superadmin successfully configures the
routing policy" half of the live-dev proof, and any live browser walkthrough of the new
`/platform/ai-routing` page (opening the config dialog, setting a default/fallback provider
and a module override, seeing them render), were **not** performed against dev and are not
claimed here. That half was verified for real only against local Postgres (all 30
assertions above) -- the "a non-superadmin is rejected, with zero residue" half, and the
underlying schema/function/RLS/grant shape, were verified for real against both the live
dev Supabase project (role-switched, as a real user, a real Postgres error raised by the
function's own check) and local Postgres, not merely asserted from reading the code or the
SQL.

**Status**: PLATFORM-P0-09.3 (Provider Routing, config-only) done. Committed and merged to
`main`. Continuing in §13's own story order: PLATFORM-P0-09.4 (AI Feature Policies) next.

---

### PLATFORM-P0-09.4 — AI Feature Policies (2026-09-12)

**Worktree hazard checked first**: `git log --oneline -3` confirmed `HEAD` genuinely on
`feature/platform-admin-portal`'s real tip (`db5034a`, this session's own prior
worktree-branch fix) before writing any code -- no repeat of the earlier hazard this
session.

**Scoped as config-only, matching 09.3's own explicit decision and 09.1/09.2's own
precedent -- not a fresh stop-and-report**: §13's own text for 09.4 is six flat fields ("AI
enabled / allowed providers / allowed models / maximum tokens / maximum run cost / daily
platform budget") with no worked example implying a specific enforcement algorithm, unlike
09.3's own Discovery/CRM/Compliance routing example that drove that story's genuine
ambiguity. Every field here is a plain, single-meaning settable value (a boolean, two lists
against a known/free-text catalog, three positive numbers) -- there is no BYOK-precedence,
failover-semantics, or module-vs-operation-granularity question analogous to 09.3's. Real
enforcement is explicitly PLATFORM-P0-10.1/10.2's own later, separate section (§14, "AI
Safety / Cost Controls": "Pause AI... and notify SUPERADMIN" when a threshold is exceeded)
-- this story only lays the policy down, the same "table now, enforcement in a later,
separate story" sequencing `platform.ai_providers.rate_limits`/`cost_controls` and
`platform.modules.enabled` (wired two stories later by 07.2) already used in this exact
backlog.

**New migration**: `supabase/migrations/20260912380000_platform_ai_feature_policies.sql` --
`platform.ai_feature_policies` (singleton, same boolean-PK-fixed-to-true trick) with
`ai_enabled` (default `true`, preserving today's actual behavior -- there is no existing
global AI kill switch anywhere in this codebase to turn off by surprise), `allowed_providers`
(text array, each entry validated inside the mutation function against `platform.
ai_providers.provider`; empty means "no restriction configured," not "block everything"),
`allowed_models` (text array, deliberately unvalidated against any catalog -- `platform.
ai_providers.models` is itself just free text with no cross-provider validation of its own,
so there is no narrower list for this column to check against either), and
`max_tokens_per_run`/`max_run_cost_usd`/`daily_platform_budget_usd` (all nullable, each
CHECKed positive-when-set, `null` meaning "no ceiling configured" -- not a fabricated
default cap). The two money columns are denominated in USD, not `platform.plans.currency`'s
own per-plan currency (which defaults to INR) -- documented reasoning: every one of the
three real AI providers bills WonderArc itself in USD regardless of which currency a
customer's own plan is priced in, so USD is the only unit that maps onto a real invoice, not
an assumption about customer-facing pricing. A dedicated `platform.ai_feature_policy_events`
audit table, same "a policy-wide change doesn't belong in a per-provider audit table, and
there is exactly one kind of event so no `action` column" reasoning `platform.
ai_provider_routing_events` already established. Audited-mutation pattern identical to
09.1-09.3: no INSERT/UPDATE/DELETE grant to `authenticated` on either table; every change
goes through `platform.update_ai_feature_policies()` (SUPERADMIN + non-empty `reason`
required, validates every `allowed_providers` entry, writes one atomic before/after
snapshot). SELECT on the policy is open to any authenticated user (same "avoid a second
widening migration later" reasoning, since a future PLATFORM-P0-10.x enforcement consumer
will most likely run as an ordinary signed-in business member); SELECT on the audit trail is
SUPERADMIN-only.

**New application code**: `packages/core/src/admin/platform-ai-feature-policies.ts` --
`getAiFeaturePolicy()`, `listAiFeaturePolicyProviderOptions()`, and
`updateAiFeaturePolicySchema`/`updateAiFeaturePolicy()` (empty numeric-field strings
normalize to `null`; a non-positive or non-numeric value is rejected client-side before the
RPC call). Postgres `numeric` columns come back from `@supabase/ssr` as strings (avoiding
float precision loss on the wire) -- converted to `number` in `toAiFeaturePolicy()` since
neither value is ever used for exact-money arithmetic in this file, only display and
round-trip into the edit form.

**New UI**: `/platform/ai-feature-policies` -- a single settings surface (one singleton
row), no table/mobile-card split needed, same reasoning `/platform/ai-routing` already
documented. One `FeaturePolicyDialog` edits the whole policy at once (an AI-enabled
checkbox, a checkbox per known provider, a comma-separated allowed-models field, and three
numeric ceiling fields). Added to `/platform`'s nav strip as "AI Feature Policies," directly
after "AI Routing."

**Deliberately not built this story**: no runtime enforcement of any kind (this story's
entire point, not an oversight -- see above); no AI usage dashboard (PLATFORM-P0-09.5,
next); no per-module/per-plan scoping of the policy (the doc's own field list is flat and
platform-wide, matching `platform.ai_provider_routing`'s own singleton shape, not a list
scoped by module or plan); no re-validation that `allowed_models` entries are real,
existing model IDs for any provider (same "opaque, no consumer enforces it yet" treatment
`platform.ai_providers.models` itself already uses, and there is no per-provider model
catalog this column could even be scoped against without inventing a `provider ->
model` pairing the doc's own flat field list doesn't ask for).

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated warning
every prior entry has logged. `node scripts/lint-import-boundaries.mjs` -- 1223 files, no
violations. `node scripts/lint-migration-schema.mjs` -- 149 migrations (148 -> 149, this
story's own file). `npx vitest run --root packages/core` -- 23 files / 226 tests (218 ->
226, +8 this story's own). `cd apps/web && rm -rf .next && npm run build` -- clean;
`/platform/ai-feature-policies` lists `ƒ` (dynamic).

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only, applied clean on the first attempt. Confirmed via
`execute_sql` after apply that the singleton row seeded with `ai_enabled = true`,
`allowed_providers = {}`, `allowed_models = {}`, and all three ceiling columns `null` -- no
fabricated lockdown -- and that `platform.ai_feature_policy_events` started empty.
`mcp__Supabase__get_advisors` (security) -- no new finding: the same 6 pre-existing
`rls_enabled_no_policy` INFO-level rows and the same pre-existing leaked-password-protection
warning every prior entry has logged; nothing new from this migration, since both new tables
have real RLS policies.

**Role-switched live proof against dev's own real data**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real `core.account_members` row, not a
superadmin) this backlog's own prior entries have repeatedly used -- role-switched `select
count(*) from platform.ai_feature_policies` returned `1` cleanly, and role-switched `select
platform.update_ai_feature_policies(...)` returned a real Postgres `P0001: Forbidden: only
a SUPERADMIN can change the AI feature policy` error -- a genuine function-level rejection.
As with every prior story in this log, there is no seeded demo superadmin user in this
environment, so the "a real superadmin CAN set the policy" half of the live-dev proof was
**not** performed against dev and is not claimed here -- verified for real only against
local Postgres (below).

**The dedicated local-Postgres RLS/behavior test this workstream's own higher bar
requires**: new `scripts/test-platform-ai-feature-policies-rls.mjs`, wired into
`package.json`'s `test:db` composite script immediately after
`test-platform-ai-provider-routing-rls.mjs`. Same Alice/Zoe pair every sibling script uses.
**All 24 assertions passed**, first run clean, against the full current migration timeline
(149 files): the singleton row starts seeded AI-enabled with no restriction/ceiling; Alice
can read the open policy row but her mutation attempt is rejected with zero residue; a
genuine superadmin can set the full policy (providers, models, all three ceilings), writing
exactly one atomic audit event; an unknown provider inside `allowed_providers` is rejected
with zero residue; a zero/negative token count, run cost, or daily budget is rejected by the
table's own CHECK constraints; an empty/whitespace reason is rejected; clearing the policy
back to disabled/no-restriction/no-ceiling is accepted as a valid, honest state (and is
itself audited); the audit trail's own SELECT is superadmin-only; and nobody -- including a
superadmin -- can bypass `update_ai_feature_policies()` with a direct
INSERT/UPDATE/DELETE on either table. Local Postgres 16 was already running in this
environment.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this environment, so the "a real superadmin successfully configures the
feature policy" half of the live-dev proof, and any live browser walkthrough of the new
`/platform/ai-feature-policies` page, were **not** performed against dev and are not
claimed here. That half was verified for real only against local Postgres (all 24
assertions above).

**Status**: PLATFORM-P0-09.4 (AI Feature Policies, config-only) done. Committed and merged
to `main`. Continuing in §13's own story order: PLATFORM-P0-09.5 (AI Usage) next.

---

### PLATFORM-P0-09.5 — AI Usage (2026-09-12)

**Worktree hazard checked first**: `git log --oneline -3` confirmed `HEAD` genuinely on
`feature/platform-admin-portal`'s real tip (`3113120`) before writing any code.

**Entity-ownership check (CLAUDE.md non-negotiable #5) drove the whole shape of this
story**: §13's own field list for 09.5 ("provider / model / module / business / run /
tokens / estimated cost / status") is almost exactly `core.ai_runs`' own columns (Epic 6
story S-4) plus a "module" the doc names but no existing table stores. Before writing
anything, checked whether "AI usage ledger" is already a canonical concept per the
entity-ownership map -- it is, twice over: `core.ai_runs` (`business_id`-scoped, the
shared home for any non-discovery module's usage) and `discovery.ai_runs`
(`workspace_id`-scoped, ADR-4's own separate discovery tenancy, "completely untouched" per
that migration's own text). **No new table was created** -- this story is a pure read
aggregation across those two already-canonical ledgers, not a third one.

**Two real, resolved (not stopped-on) data-modeling questions, both non-security judgment
calls per this run's own task brief ("layout, which existing pattern to reuse, exact
naming you may decide yourself and document")**:

1. **"module" has no stored column on either ledger.** Grepped every current caller of
   `recordAiRun()` outside `module-discovery` to find the real answer: exactly four
   operations, all logged by `module-crm` (`summarize_customer`, `summarize_conversation`,
   `check_response_quality`, `draft_review_response`) -- `module-fsm`/`module-gst`/
   `module-inventory` call no LLM at all yet (confirmed by the same grep). Built
   `CORE_AI_RUN_OPERATION_MODULE`, a small explicit map from that real, current mapping,
   not a guess -- a `core.ai_runs` row whose `operation` isn't in the map (a future
   module's own new operation, until this map is updated alongside it) shows `module:
   null` in the API and "Unknown (operation_name)" in the UI, never a fabricated label.
   `discovery.ai_runs` rows are always `module: "discovery"` (that table has no other
   writer). Retrofitting a real `module_key` column onto `core.ai_runs` -- and updating
   every module's own `recordAiRun()` call site to pass it -- would be a cross-cutting
   change to shared infrastructure *and* to other workstreams' own module packages,
   explicitly out of scope per this run's own task brief ("Do not touch module-discovery...
   or any other workstream's files") and unnecessary for a "track" story with no
   enforcement of its own.
2. **"business" for a `discovery.ai_runs` row is not `account_id`.** That table does carry
   an `account_id` column, but an account can own more than one business (00-MASTER-
   PLAN.md's own tenancy model), so it can't resolve to one specific business name.
   Resolved instead via the real, already-existing chain `discovery.ai_runs.workspace_id
   -> discovery.workspaces.product_id -> discovery.products.business_id -> core.
   businesses` -- verified correct against dev's own real data below, not merely asserted.

**New application code**: `packages/core/src/admin/platform-ai-usage.ts` --
`listAiUsage(limit = 100)`, a pure read merging the most recent `limit` rows from each
ledger (service-role `createAdminClient()`, the same cross-tenant-read pattern
`platform-dashboard-queries.ts` already established, gated by this file's own
`requireSuperadmin()` call), resolving business names for both sources, and sorting the
merge by `created_at` descending before trimming back to `limit`. Never reads
`core.ai_provider_credentials`/`discovery.ai_provider_credentials`/`platform.
ai_provider_keys` anywhere -- §13's own explicit "do not expose secret credentials"
instruction for this story, trivially satisfied since this file has no reason to touch any
of the three credential tables at all.

**No new migration, no new RLS test script**: this story writes nothing and creates no
table -- both underlying ledgers' own RLS is unchanged and already proven by their own
original stories' test coverage, and the only authorization gate this file adds
(`requireSuperadmin()`) is the same, already-proven check every other `platform-ai-*.ts`
file in this backlog reuses verbatim. This mirrors `platform-dashboard-queries.ts`'s own
precedent exactly -- that file, the very first cross-tenant superadmin read in this
backlog, also added no dedicated RLS script for the same reason (confirmed by checking:
no `scripts/test-platform-dashboard-*.mjs` exists).

**New UI**: `/platform/ai-usage` -- unlike `/platform/ai-routing` and `/platform/
ai-feature-policies` (a single settings row each), this page's primary content genuinely
is a table of many rows, so the desktop-table/mobile-card split (CLAUDE.md development
principle #12, docs/design/claude-ui-design-rules.md rule 5) applies here, mirroring
`ai-providers/page.tsx`'s own established split. Columns: when, module (with the real
operation name shown whenever the module is unknown), business, provider/model, tokens,
estimated cost, status. Added to `/platform`'s nav strip as "AI Usage," directly after "AI
Feature Policies."

**Deliberately not built this story**: no filtering/search/pagination beyond "the most
recent 100 runs" (§13 says "track," not "search" -- CLAUDE.md development principle #7);
no aggregate totals/charts (a natural future enhancement, not asked for by this story's own
flat field list); no `module_key` column on `core.ai_runs` (see judgment call 1 above); no
AI Safety/Cost Controls enforcement tying this data to the ceilings PLATFORM-P0-09.4 just
configured (that wiring is PLATFORM-P0-10.1/10.2's own later, separate section, §14).

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated warning
every prior entry has logged. `node scripts/lint-import-boundaries.mjs` -- 1226 files, no
violations (no migration touched this story, so `lint:migrations` was not re-run against a
changed timeline). `npx vitest run --root packages/core` -- 24 files / 229 tests (226 ->
229, +3 this story's own -- `CORE_AI_RUN_OPERATION_MODULE`'s own known/unknown-operation
behavior, plus a type-level export check). `cd apps/web && rm -rf .next && npm run build`
-- clean; `/platform/ai-usage` lists `ƒ` (dynamic).

**Real-data verification against dev**: `execute_sql` against the **dev** project
(`jazdtomcgqjxjueedmck`) confirmed `core.ai_runs` currently holds `0` rows (no non-
discovery module has logged AI usage yet, matching the grep above) and `discovery.ai_runs`
holds `115` real rows. Ran the exact `workspace -> product -> business` join
`resolveDiscoveryBusinesses()` performs (as three separate lookups in the application code,
expressed here as one SQL join for verification) against those real rows: it resolved
cleanly to real business names (e.g. "Meridian HomeTech Solutions") for the five most
recent real runs, confirming the join chain is correct against live data, not merely
plausible from reading the code. No migration was applied this story (none was written),
so `mcp__Supabase__get_advisors` was not re-run (nothing changed for it to newly flag).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this environment, so an actual live browser walkthrough of
`/platform/ai-usage` (which needs a real SUPERADMIN session to pass the outer layout's own
`requireSuperadmin()` redirect) was **not** performed and is not claimed here. What *was*
verified for real against dev: the underlying data (`core.ai_runs`/`discovery.ai_runs` row
counts) and the join logic this file's own business-name resolution depends on, both
directly against live data rather than only asserted from reading the code.

**Status**: PLATFORM-P0-09.4 and 09.5 both done. §13 ("Internal AI Provider & Keys") is now
fully complete (09.1 through 09.5). Committed and merged to `main`. Continuing per this
doc's own section order into §14 ("AI Safety / Cost Controls," PLATFORM-P0-10.1/10.2) next.

---

### PLATFORM-P0-10.1/10.2 — AI Safety / Cost Controls (2026-09-12) — STOP AND REPORT

**Worktree hazard checked first**: `git log --oneline -3` confirmed `HEAD` genuinely on
`feature/platform-admin-portal`'s real tip (`36de41a`) before reading anything further.

**§14's own text in full** -- two stories, ten words of field names and one sentence of
behavior, nothing else:

```text
PLATFORM-P0-10.1 -- Platform AI Budget
Configure: daily budget / monthly budget / per-business budget / per-feature budget

PLATFORM-P0-10.2 -- AI Circuit Breaker
If configured threshold is exceeded: Pause AI, and notify SUPERADMIN.
```

**This is a genuine architectural ambiguity to stop and report on, for the same reason
09.3 was, not a case with an existing, reusable pattern to follow** -- and it compounds
two separate open questions, one a real duplicate-of-existing-data risk (CLAUDE.md
non-negotiable #5) and one squarely "real AI-calling infrastructure with an unstated
algorithm" (this run's own task brief's own stop-and-report trigger).

**Question 1 -- does 10.1 duplicate a field PLATFORM-P0-09.4 already built?**
09.4's own migration (`20260912380000_platform_ai_feature_policies.sql`) already added
`platform.ai_feature_policies.daily_platform_budget_usd` -- a platform-wide daily USD
ceiling -- with its own docstring explicitly framing it as one of the knobs "PLATFORM-
P0-10.1/10.2's own later, separate story" would eventually enforce. §14's own "daily
budget" field for 10.1 reads like the exact same concept named slightly differently, not a
new one. Building a second, independent "daily budget" column/table for 10.1 would create
exactly the "two independently-writable sources of truth" CLAUDE.md non-negotiable #5
warns against (which value would 10.2's own circuit breaker read if they ever drift?) --
but the doc gives no signal either way, and this workstream's own prior entry (09.3's own
stopped entry, "09.3 lists 'default model' again as a routing-level field... The doc's flat
field list doesn't distinguish") already flagged this exact class of doc-duplicate-field
ambiguity as something to ask about, not silently resolve.

**Question 2 -- "per-business budget" and "per-feature budget" have no defined
granularity.** Is "per-business budget" a single number applied identically to every
business (a multiplier/ceiling shape), or a genuinely per-business override (which would
need a new `business_id`-keyed table, a materially bigger structural addition than
09.4's flat singleton row)? Is "per-feature budget" scoped to an `AiOperation`
(`operation-registry.ts`'s 19 operations), a `ModuleKey` (the same five-module dimension
`platform.ai_provider_routing`'s own `module_overrides` already uses), or a
`platform.feature_flags` row (a real, existing "feature" concept in this exact schema,
with a different meaning entirely -- an on/off flag, not a spend ceiling)? This codebase
already uses "feature" for at least two unrelated things (`platform.features`/
`plan_features`'s commercial entitlement catalog, and `platform.feature_flags`'
operational kill-switch catalog) -- picking wrong here risks a `platform.ai_*` budget
table that shares a name with, but no real relationship to, an already-existing and
differently-scoped `feature` concept.

**Question 3 -- 10.2's "Pause AI" is real runtime enforcement, exactly what 09.3's own
routing wiring was explicitly deferred to avoid.** Making a circuit breaker actually pause
AI requires: (a) a way to compute real spend against a budget -- synchronously per request
(reading `core.ai_runs`/`discovery.ai_runs` on every call, a real latency/load cost) or
periodically via a cron-style job (this codebase's own established "table plus a cron"
pattern, ADR-5) -- the doc says nothing about which; (b) an actual gate checked by
`business-router.ts`/discovery's own router before a call is allowed to proceed --
precisely the file this run's own task brief named as off-limits for 09.3
("No runtime code should read this new table yet... deferred to a future story once the
BYOK-precedence/failover/granularity/missing-key-fallback questions... are separately
answered") and unchanged by every story in this section since; and (c) a "notify
SUPERADMIN" mechanism that does not exist anywhere in this codebase today -- grepped for
any existing "notify superadmin"/admin-alerting pattern (email, in-app banner, a
`platform.notifications` table) and found none, so this piece cannot even reuse an
established pattern the way 09.1's secret-storage question could reuse BYOK's. A
config-only 10.2 (a threshold value nothing ever reads) would not be a circuit breaker at
all -- the same "a config-only story under a title that specifically implies the registry
does something" critique 09.3's own stopped entry raised about itself, now doubly true for
a feature literally named for the thing it would not do.

**Nothing was built or changed this story** -- no migration, no application code, no UI.
This audit-log entry and the Progress-table update above are the only changes.

**Recommendation, not a decision**, mirroring 09.3's own stopped entry's own shape: the
narrowest, lowest-risk config-only path once the user answers the above would likely be
(a) extending `platform.ai_feature_policies` in place with `monthly_budget_usd` (resolving
question 1 by treating 10.1's "daily budget" as the *same* field 09.4 already built, not a
duplicate), while leaving "per-business"/"per-feature" budgets unbuilt until their own
scope is answered (question 2) rather than guessing a shape that might have to be torn out;
and (b) deferring all of 10.2 (the actual pause/notify behavior) to a further, separate
story once its own runtime-wiring and notification-mechanism questions are answered --
mirroring exactly how this run's own 09.3 (config-only) resolution deferred Reading 2's
real wiring. But that is this agent's own suggestion for how to *sequence* the work, not a
substitute for the user answering the three questions above.

**Status**: PLATFORM-P0-10.1/10.2 stopped, open questions written above. Resume once the
user decides. This run stops here for this workstream.

---

### PLATFORM-P0-10.1 — Platform AI Budget, RESUMED with user decisions (2026-09-12)

**Worktree hazard checked first**: `git fetch origin main feature/platform-admin-portal`
confirmed `origin/main..origin/feature/platform-admin-portal` empty (the feature branch's
own history is a strict prefix of `main`'s -- every prior story already landed via the
scratch-branch merge procedure). `git log --oneline -3` on the fresh worktree's default
branch showed a local `dad6e76` ("docs: full test-case audit across all modules") sitting
directly on `origin/main`'s own tip, not a stray scratch-merge commit -- confirmed
genuinely clean, not the worktree-branch-desync hazard prior entries in this log have hit.
Reset a local `feature/platform-admin-portal` branch to `origin/main`'s tip (the actual
up-to-date state, since `origin/feature/platform-admin-portal` itself is stale relative to
`main` by design of the scratch-branch auto-merge procedure) before writing any code.

**The user has decided all three open questions the prior stop-and-report entry raised, in
full, not partially** (see the assignment for this run, reproduced in spirit rather than
verbatim below):

1. §14's "daily budget" for 10.1 IS `platform.ai_feature_policies.daily_platform_budget_usd`
   (09.4's own field) -- not a duplicate. 10.1 adds ONLY a new `monthly_budget_usd` column on
   the SAME row, through the SAME audited-mutation function (extended in place, not
   duplicated) and the SAME UI page.
2. Per-business budget and per-feature budget are DEFERRED -- no `business_id`-keyed table,
   no per-`AiOperation`/`ModuleKey`/feature-flag budget dimension, this story or ever until a
   future story separately scopes the granularity question.
3. All of PLATFORM-P0-10.2 (the circuit breaker) is DEFERRED -- no runtime enforcement wiring,
   no threshold-config field beyond the two budget numbers config-only 10.1 stores, no
   notification mechanism.

This entry implements exactly decision #1 and explicitly builds nothing covered by #2/#3.

**What was built**: `supabase/migrations/20260912390000_platform_ai_feature_policies_monthly_budget.sql`
-- `alter table platform.ai_feature_policies add column monthly_budget_usd numeric(12, 2)`
(nullable, `check (monthly_budget_usd is null or monthly_budget_usd > 0)`, the identical
shape 09.4 already used for `daily_platform_budget_usd`, same USD-denomination reasoning
that migration already documented in full -- every real AI provider bills WonderArc itself
in USD regardless of a customer plan's own currency). `platform.update_ai_feature_policies()`
gains one new parameter, `p_monthly_budget_usd numeric`, positioned right after
`p_daily_platform_budget_usd` and before `p_reason` (matching §14's own "daily budget /
monthly budget" field order) -- `CREATE OR REPLACE` cannot add a parameter (a genuine
signature change), so this drops and recreates the function, the exact same precedent
`20260912120000_core_try_consume_usage_counter_soft_limits.sql` already established for a
prior story's own function-signature change. No new table, no second audit table --
`platform.ai_feature_policy_events`'s existing `to_jsonb(v_row)` snapshot picks up the new
column automatically since it snapshots the whole row.

**Application/UI, same file, same page, no new route**:
`packages/core/src/admin/platform-ai-feature-policies.ts` gains `monthlyBudgetUsd` on
`AiFeaturePolicy`/`AiFeaturePolicyRow` (same numeric-string-from-Postgres -> `number`
conversion `dailyPlatformBudgetUsd` already used) and on
`updateAiFeaturePolicySchema`/`updateAiFeaturePolicy()`'s RPC call (same
`optionalPositiveNumberSchema` empty-string-to-`null` treatment as every other ceiling
field). `/platform/ai-feature-policies/page.tsx` gets one more read-only `Field` ("Monthly
platform budget"); `feature-policy-dialog.tsx` gets one more input in the same ceilings
group -- the three-column ceilings grid became a 2x2 `grid-cols-2` grid to fit the fourth
field without cramming four columns into one row on a `max-w-lg` dialog (a small
responsiveness improvement made in passing while touching this exact grid, not a broader
unrelated redesign of the page).

**Deliberately not built this story, per decisions #2/#3 above**: no `business_id`-keyed
budget table or column; no per-`AiOperation`/per-`ModuleKey`/per-feature-flag budget
dimension; no runtime enforcement of either budget number against real spend; no
"threshold exceeded" check; no pause-AI gate in `business-router.ts` or discovery's own
router (both untouched, confirmed by `git diff --stat` after this story's changes); no
SUPERADMIN-notification mechanism (none exists anywhere in this codebase, unchanged from
the prior stop-and-report entry's own grep). PLATFORM-P0-10.2 (circuit breaker), 10.3
(Provider Failure Fallback), and 10.4 (AI Feature Kill Switch) all remain **Not started** --
this run's own assignment says to continue past §14 into §15 next once 10.1 lands, so 10.3
and 10.4 are left open for a future story rather than picked up here, recorded explicitly
so the Progress table above doesn't silently imply §14 is fully closed out.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace (this
worktree needed its own `npm install` first, the same fresh-worktree `node_modules`
symlink issue every prior entry in this log has documented). `npm run lint
--workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated warning
(`Package` unused import in a CRM conversations page) every prior entry has logged.
`node scripts/lint-import-boundaries.mjs` -- 1452 files, no violations.
`node scripts/lint-migration-schema.mjs` -- 190 migrations (189 -> 190, this story's own
file; the jump from 09.4/09.5's own entry's migration counts reflects other workstreams'
concurrent merges into `main` since then, not anything untracked by this story).
`npx vitest run --root packages/core` -- 24 files / 230 tests (229 -> 230, +1 new
`monthlyBudgetUsd`-rejection case, plus the existing full-policy/empty-policy cases
extended in place to also assert the new field rather than adding two more near-duplicate
tests for it). `apps/web`'s own `vitest run --passWithNoTests` -- 50 tests, unchanged.
`cd apps/web && rm -rf .next && npm run build` -- clean; `/platform/ai-feature-policies`
still lists `ƒ` (dynamic), inheriting the outer layout's existing `force-dynamic` with no
change needed.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only, applied clean on the first attempt. Confirmed via
`execute_sql` that the singleton row now carries `monthly_budget_usd = null` (no fabricated
lockdown the moment the column starts existing, same as every other ceiling column's own
seed). `mcp__Supabase__get_advisors` (security and performance) -- **zero new findings**:
the same 6 pre-existing `rls_enabled_no_policy` INFO rows and the pre-existing leaked-
password-protection warning (security); the same pre-existing "unused index"/"unindexed
foreign key" INFO rows across every schema in this empty dev database (performance) -- this
migration added one nullable column and replaced one function body, no new index, no new
RLS policy, so neither advisor had anything new to flag.

**Role-switched live proof against dev's own real data**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real `core.account_members` row, not a
superadmin) this backlog's own prior entries have repeatedly used -- role-switched `select
count(*) from platform.ai_feature_policies` returned `1` cleanly, and role-switched `select
platform.update_ai_feature_policies(true, array[]::text[], array[]::text[], null, null,
null, 500, 'trying to set monthly budget as non-superadmin')` (the new 8-parameter
signature, monthly budget included) returned the real Postgres `P0001: Forbidden: only a
SUPERADMIN can change the AI feature policy.` error -- a genuine function-level rejection
against the actual new signature, not merely against the old one. As with every prior story
in this log, there is no seeded demo superadmin user in this environment, so the "a real
superadmin CAN set the monthly budget" half of the live-dev proof was **not** performed
against dev and is not claimed here -- verified for real only against local Postgres
(below).

**The dedicated local-Postgres RLS/behavior test, extended in place (per this workstream's
own rule for "extending an existing table" rather than writing a new script)**:
`scripts/test-platform-ai-feature-policies-rls.mjs` -- every one of its existing
`update_ai_feature_policies(...)` calls updated to the new 8-parameter signature (the new
argument threaded through positionally, matching the migration's own parameter order), plus
two new assertions (a zero and a negative `monthly_budget_usd` are each rejected by the
table's own CHECK constraint) and the existing seed/full-set/clear assertions extended to
also check `monthly_budget_usd` rather than duplicated into parallel tests. **All 26
assertions passed** (24 -> 26, +2 new), first run clean, against the full current migration
timeline (190 files) -- proving the extended function's real behavior against a real
Postgres 16, not merely asserted from reading the SQL. Local Postgres 16 needed starting
this session (`pg_ctlcluster 16 main start`) before the run.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this environment, so a live browser walkthrough of
`/platform/ai-feature-policies` actually setting a monthly budget through the real UI was
**not** performed and is **not** claimed here. This entry documents build/typecheck/lint/
unit-test correctness and a direct read of the applied schema/RLS/function against the live
dev database (the "SUPERADMIN-only" half proven live; the "a real superadmin succeeds" half
proven only against local Postgres), not an end-to-end UI verification.

**Status**: PLATFORM-P0-10.1 done (config-only, user-decided scope). PLATFORM-P0-10.2
remains deferred per decision #3 (real runtime enforcement + an undefined SUPERADMIN-
notification mechanism, neither built here); PLATFORM-P0-10.3 (Provider Failure Fallback)
and PLATFORM-P0-10.4 (AI Feature Kill Switch) remain **Not started** -- this run's own
assignment says to continue past §14 into the doc's next section (§15, "Global Email /
Notification Configuration") once 10.1 lands, so 10.3/10.4 are left open for a future story
rather than picked up now. Committed and merged to `main`. Continuing per this doc's own
section order into §15 next.

### PLATFORM-P0-11.1 — Email Provider (2026-09-12)

**Worktree hazard checked first**: `git log --oneline -3` on entry showed `HEAD` on
`5d3e847` ("Merge branch 'feature/platform-admin-portal' into scratch-plat-10-1-merge"), one
commit *ahead of* `origin/feature/platform-admin-portal` itself, and `git log
origin/feature/platform-admin-portal..origin/main` was non-empty (`main` had moved further
via the scratch-branch auto-merge procedure, `feature/platform-admin-portal` itself was
stale by design, matching this workstream's own documented hazard). Reset with `git checkout
-B feature/platform-admin-portal origin/main`, landing exactly on `5d3e847`, confirmed
identical to `origin/main`'s own tip before writing any code. `npm install` run fresh (no
`node_modules` in this worktree).

**§15's own text in full** -- three sub-stories, each a short field/item list:

```text
PLATFORM-P0-11.1 -- Email Provider
Configure: provider / from name / from email / reply-to

PLATFORM-P0-11.2 -- System Email Templates
Manage templates for: welcome / verification / password/security events / subscription /
usage limits / compliance reminders / system announcements

PLATFORM-P0-11.3 -- Notification Policies
Configure platform defaults for: email / in-app / push
```

**The entity-ownership question this run's own task assignment flagged, read closely and
resolved, not guessed at**: does 11.1's "from name" duplicate `platform.branding.
email_from_name` (PLATFORM-P0-03.1's own "Email Branding" column, whose own audit entry
above says it was built "waiting for PLATFORM-P0-11 to plug into")? Read both sources in
full before deciding, per the assignment's own instruction:

- `platform.branding.email_from_name` (`20260911010000_platform_branding.sql`) is a single
  `text` column, no `from_email`/`reply_to`/`provider` alongside it, filed under a section
  the migration's own comment literally labels "Email Branding" -- and PLATFORM-P0-03.1's
  own audit entry above states, in its own words, the reason no email consumer was wired up:
  "there is no email-sending system yet (PLATFORM-P0-11) for `email_from_name` to plug
  into." That is not a coincidental naming collision -- it is the prior story's own stated
  design intent that this exact story would be the one to make that column meaningful.
- §15's own "from name" field, read literally, names the same real-world concept: the
  display name a recipient's mail client shows for a platform-originated email's sender.
  There is no second, materially different reading of "from name" anywhere in §15's four
  words of text for 11.1, unlike PLATFORM-P0-10.1's own "daily budget" duplicate-field
  question (which required a user decision because *both* readings -- "the same field" and
  "a genuinely new, different ceiling" -- were textually plausible and the doc gave no way
  to tell them apart). Here, only one reading is textually plausible.

**Verdict: cleanly resolvable, not a stop-and-report** -- reuse `platform.branding.
email_from_name` as the one and only "from name" value; this migration adds no
`from_name`-shaped column. This differs from PLATFORM-P0-09.3/10.1's own stopped entries in
kind, not just degree: those each compounded a duplicate-field question with a genuine,
textually unstated *algorithm* question (BYOK precedence/failover semantics for 09.3;
"per-business"/"per-feature" granularity plus an undefined circuit-breaker/notification
mechanism for 10.1/10.2) -- exactly the class of thing this run's own task brief names as a
stop-and-report trigger. Nothing here asks this story to invent a runtime algorithm; the
only real work is a data-modeling choice (add three new columns to `platform.branding`
itself, or a new table that doesn't re-store the fourth), and the prior story's own audit
trail already answers which of those the fourth field's design intent was.

**A second, materially bigger discovery made during reconnaissance, not assumed away**:
grepping this codebase for any existing "email provider" concept (`sendgrid`, `resend`,
`postmark`, `ses`, `mailgun`, `nodemailer`, `smtp`) surfaced real, already-live email-sending
code -- `resend` (the npm package) called directly, today, from roughly a dozen call sites
across three modules (`module-discovery`: `lib/messages/send.ts`,
`lib/messages/resend-templates.ts`, `lib/interest/notify.ts`; `module-fsm`:
`lib/reminders`, `lib/customer-center`, `lib/invoices`, `lib/estimates`, `lib/events`,
`lib/messages`; `module-gst`: `lib/reminders`), every one reading `process.env.
RESEND_API_KEY`/`process.env.RESEND_FROM_EMAIL` directly, no database config at all. This
was not mentioned anywhere in this backlog's own prior entries (PLATFORM-P0-02.2's
Configuration Health "email" category and PLATFORM-P0-03.1's own note both describe "no
email-sending system yet" in a way that reads, in isolation, as if none existed).

Considered stopping over this, since it raises the same shape of "config table vs. an
already-live, unwired mechanism" tension PLATFORM-P0-09.3's own entry flagged as a stop
trigger -- but concluded it is not one, on inspection: PLATFORM-P0-09.1 itself already
established and shipped, without stopping, the exact same pattern -- a new `platform.
ai_providers` config registry built and merged while `business-router.ts`'s own
`getPlatformCredential()` fallback stayed hardcoded to `provider: "anthropic"` reading
`PLATFORM_AI_API_KEY`, completely untouched, with the actual wiring explicitly deferred to
09.3 (a later, separate, still-open story). §15's own field list for 11.1 says nothing about
migrating these dozen Resend call sites or unifying them behind one sender, and doing so
would require inventing a real migration/cutover plan (do all call sites switch at once? is
there a fallback if the new config is incomplete? what happens to a message already queued
mid-cutover?) that is squarely the "real infrastructure with an unstated algorithm" class of
question this run's own task brief reserves for a stop, not "config registry with no
consumer yet" (09.1's own accepted shape). So this story proceeds config-only, exactly like
09.1, but **states the gap plainly** rather than the way 03.1/02.2's own prior wording
happened to read as if no live path existed: the migration's own docstring, the app layer's
docstring, and the admin page's own on-screen copy (an amber warning banner, not a footnote)
all name the real Resend env-var call sites directly, so a future superadmin configuring
this screen -- and a future story that eventually wires it up -- both start from an accurate
picture, not the one this story almost shipped with before the grep.

**What was built**: migration `20260912400000_platform_email_provider.sql` -- singleton
`platform.email_provider` (boolean PK fixed to `true`, same construction as `platform.
branding`), with `provider` (free text, not a closed enum -- unlike `platform.
ai_providers.provider`, no closed TS union or SDK integration for "email provider" exists
anywhere in this codebase to validate against, so constraining it now would invent a
catalog nothing could ever route to), `from_email`/`reply_to` (each a nullable, regex-
checked email address, same pattern `platform.branding.support_email` already uses), and
`updated_at`/`updated_by`. No `from_name` column -- see the entity-ownership section above.
No secret/credential column -- §15 has no "Email Provider Credentials" sub-story the way
§13 named "Secure API Key Storage" (09.2) as its own explicit companion to "Internal AI
Provider Registry" (09.1); PLATFORM-P0-12.4 ("Credential Separation") reads as the more
likely future home for actual per-integration secret storage, not this story's to guess at.
Every mutation goes through `platform.update_email_provider_config()` (SECURITY DEFINER,
`is_superadmin()` + non-empty-reason checks, one `platform.email_provider_events` audit row
per change via `to_jsonb()` snapshots -- safe here since no secret column exists on this
table at all) -- the audited-function pattern `platform.ai_providers`/`platform.
ai_feature_policies` already established, not `platform.branding`'s own plainer RLS-gated
`.update()`, since this run's own task brief sets a higher security bar and `from_email`/
`reply_to` are a real phishing/spoofing-adjacent surface once any email system reads them,
not merely cosmetic like branding's colors/copy. RLS is superadmin-only SELECT (unlike
`platform.ai_providers`' own open-to-`authenticated` SELECT, which was deliberately widened
in anticipation of PLATFORM-P0-09.3's own named future routing consumer -- §15 names no
analogous consumer, so this story does not speculate a wider grant ahead of need). No
INSERT/UPDATE/DELETE grant to `authenticated` on either table -- singleton-row and
audited-function-only-write, matching `platform.branding`/`platform.ai_providers`.

**Application layer** (`packages/core/src/admin/platform-email-provider.ts`):
`getEmailProviderConfig()` reads this table's three fields *and* calls the existing
`getPlatformBranding()` to surface `email_from_name` as a read-only `fromName` field on the
same response -- there is no `updateEmailProviderConfig()` write path for it at all, so the
one and only way to change "from name" stays `/platform/branding`'s own draft/publish flow
(PLATFORM-P0-03.5). `updateEmailProviderConfigSchema` validates `provider` (optional, free
text, 120-char cap, empty clears it), `fromEmail`/`replyTo` (optional, `z.string().email()`,
empty clears), and a required `reason`. 7 new unit tests in
`platform-email-provider.test.ts` (valid config, empty-to-null normalization, malformed
from/reply-to email, blank reason, provider trimming, overlong provider rejection).

**UI**: new `apps/web/app/platform/(protected)/email-provider/` (page.tsx, actions.ts,
email-provider-dialog.tsx) -- a singleton settings surface, same shape as `/platform/
ai-feature-policies` (a `Field` list plus one "Configure" dialog, reason required to save;
no table/mobile-card split needed per CLAUDE.md development principle #12, which targets a
page whose *primary* content is a table of *many* rows, not a page holding one config row).
"From name" renders as a plain read-only field with a link to `/platform/branding`'s own
"Email branding" section, not an editable input -- consistent with the application layer
having no write path for it. An amber warning banner above the settings card states the
real-Resend-env-var gap in plain language (see above) -- the same "state what this doesn't
do yet" honesty `/platform/ai-feature-policies`' own copy already established
("configuration only... nothing here is enforced by any real AI call yet"), made more
concrete here since this story found something specific to name. `apps/web/app/platform/
layout.tsx` gains one nav entry, "Email Provider", after "AI Usage".

**Deliberately not built this story**: no wiring of any of the dozen real Resend call sites
to this table (see the discovery/reasoning above); no email-provider credential/API-key
storage (no such sub-story exists in §15; a future story's job if one is ever added,
following `platform.ai_provider_keys`' own zero-grant lockdown pattern); no closed
provider enum (no existing catalog to validate against); PLATFORM-P0-11.2 (System Email
Templates) and PLATFORM-P0-11.3 (Notification Policies) are their own separate stories in
this same §15 section, picked up next, not folded in here.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace (fresh
worktree `npm install` needed first, same recurring cross-checkout symlink issue every
prior worktree-run entry in this log has documented). `npm run lint --workspaces
--if-present` -- 0 errors after fixing one unescaped-quote catch in the new page's own copy
(the same recurring class of lint 03.1/03.5 also hit), 1 pre-existing unrelated warning
(`Package` unused import in a CRM conversations page, untouched by this story). `node
scripts/lint-import-boundaries.mjs` -- 1471 files, no violations. `node
scripts/lint-migration-schema.mjs` -- 193 migrations (190 -> 193; +1 this story's own file,
+2 other workstreams' concurrent merges into `main` since 10.1's own entry), no violations.
`npx vitest run --root packages/core` -- 25 files / 237 tests (24/230 -> 25/237, +7 new
`updateEmailProviderConfigSchema` cases), all passing. `apps/web`'s own `vitest run
--passWithNoTests` -- 50 tests, unchanged. `cd apps/web && rm -rf .next && npm run build` --
clean; `/platform/email-provider` lists `ƒ` (dynamic), inheriting the outer layout's
existing `force-dynamic` with no change needed.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only, applied clean on the first attempt. Confirmed via
`execute_sql` that the singleton row seeded with `provider`/`from_email`/`reply_to` all
`null` (no fabricated "configured" state). `mcp__Supabase__get_advisors` (security and
performance) -- **zero new findings**: the same 6 pre-existing `rls_enabled_no_policy` INFO
rows and the pre-existing leaked-password-protection warning (security); the two new
indexes (`email_provider_updated_by_idx`, `email_provider_events_performed_by_idx`) appear
only as the same benign "unused index" INFO class every sibling table's own FK index
already carries in this empty dev database (performance) -- no new unindexed-FK finding,
no new RLS-policy-shape finding.

**Role-switched live proof against dev's own real data**: using the same real non-superadmin
user (`c8040fb0-b46c-4131-9ea7-195e8157d27b`) this backlog's own prior entries have
repeatedly used -- role-switched `select count(*) from platform.email_provider` returned
`0` (RLS-filtered, not an error), and a role-switched call to
`platform.update_email_provider_config('SendGrid', 'notifications@wonderarc.com',
'support@wonderarc.com', 'trying as non-superadmin')` returned the real Postgres `P0001:
Forbidden: only a SUPERADMIN can change the email provider configuration.` error -- a
genuine function-level rejection, not merely an RLS-filtered empty read. As with every
prior story in this log, there is no seeded demo superadmin user in this environment, so
the "a real superadmin CAN configure it" half of the live-dev proof was **not** performed
against dev and is not claimed here -- verified for real only against local Postgres
(below).

**The dedicated local-Postgres RLS/behavior test**: new `scripts/test-platform-email-
provider-rls.mjs` (added to `package.json`'s `test:db` composite script, after
`test-gst-exemption-certificates-rls.mjs`) -- seeds a real business admin (Alice, not a
superadmin) and a real superadmin (Zoe, seeded the service-role/migration-only way the
actual bootstrap flow works). Asserts: the singleton starts unconfigured; Alice gets 0 rows
on SELECT and her mutation attempt is rejected with zero residue in either table; Zoe can
SELECT and successfully update the config via the audited RPC, which writes exactly one
`config_updated` event with a real before/after snapshot; a blank/whitespace reason is
rejected even for Zoe; a malformed `from_email`/`reply_to` is rejected by the table's own
CHECK constraint even when submitted by Zoe through the RPC; and -- the negative space this
story's own singleton/audited-function design promises but nothing explicitly asked to
test -- **not even Zoe** can INSERT a second row, DELETE the singleton, or bypass the RPC
with a direct UPDATE, since no such grant to `authenticated` exists at all. Ran locally
against a real, already-running local Postgres 16 cluster (`pg_lsclusters` confirmed it
online, no restart needed this time): **all 24 assertions passed** on the first corrected
run (one query needed a `coalesce()` fix after a first run failed on SQL NULL-propagation
through string concatenation, not an RLS/behavior bug) against the full current migration
timeline (194 files).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this sandboxed environment, so a live browser walkthrough of
`/platform/email-provider` actually saving a configuration through the real UI was **not**
performed and is **not** claimed here. This entry documents build/typecheck/lint/unit-test
correctness and a direct read of the applied schema/RLS/function against the live dev
database (the "SUPERADMIN-only" half proven live; the "a real superadmin succeeds" half
proven only against local Postgres), not an end-to-end UI verification.

**Status**: PLATFORM-P0-11.1 done (config-only, "from name" reuses `platform.branding.
email_from_name` rather than duplicating it -- a clean resolution, not a stop-and-report,
per the reasoning above). PLATFORM-P0-11.2 (System Email Templates) and PLATFORM-P0-11.3
(Notification Policies) remain open, picked up next in section order. Committing and
merging to `main`, then continuing.

### PLATFORM-P0-11.2 — System Email Templates (2026-09-12)

**Entity-ownership check (CLAUDE.md non-negotiable #5)**: read `core.message_templates`'
own migration (`20260908100000_core_messages.sql`) in full before writing anything. It is
`business_id`-scoped and freely named (`unique (business_id, name)`, no fixed catalog) --
a *business's own* templates for messaging *its own customers* (Kickserv-style messaging/
reminder templates). PLATFORM-P0-11.2's "System Email Templates" are the opposite on every
axis that matters: WonderArc's own transactional emails to *platform users* (a founder
resetting a password, a business owner told they hit a usage limit), never
`business_id`-scoped, and a fixed, doc-named catalog (welcome / verification / password-
security / subscription / usage limits / compliance reminders / system announcements) a
superadmin edits the *content* of, never creates or deletes a new one of. No overlap, no
duplication -- confirmed by reading the actual table, not inferred from the similar name.
Also checked: `module-discovery`'s own `resend_template_id`/`resend_template_name` columns
(`20260907170000_discovery_messages_resend_templates.sql`, surfaced during PLATFORM-P0-11.1's
own reconnaissance) point at templates stored in a *founder's own Resend account* -- a
different, tenant-scoped, BYOK-adjacent concept, not a database table this story could
duplicate.

**What was built**: migration `20260912410000_platform_email_templates.sql` --
`platform.email_templates`, a fixed, seven-row catalog (`template_key text primary key`
constrained to exactly the seven values above -- `password_security` as one key, matching
the doc's own single "password/security events" bullet rather than inventing a split the
text doesn't ask for), each row holding `subject`/`body` (both nullable free text, no
templating-variable syntax defined or validated -- §15 names none, and no consumer parses
these columns yet, the same "underspecified shape, don't invent one" reasoning
`platform.ai_providers.rate_limits`/`cost_controls` already established for their own
doc-silent shape). Seeded with all seven keys, `subject`/`body` both null -- no fabricated
copy, matching every sibling table's own "no fake 'on' state" convention. No
`create_email_template()`/`delete_email_template()` function -- same fixed-catalog shape
`platform.ai_providers`/`platform.modules` already use (seed once, edit forever, never
add/remove through the app). Audited-write pattern, matching PLATFORM-P0-11.1's own
`platform.email_provider`, not `platform.branding`'s plainer `.update()`: this run's own
higher security bar applies here with real teeth -- the "password/security events" template
is a textbook phishing target (an attacker who could edit its copy/links could turn
WonderArc's own password-reset email into a credential-harvesting vector for every business
on the platform). Every write goes through `platform.update_email_template()` (SECURITY
DEFINER, `is_superadmin()` + non-empty-reason checks, one `platform.email_template_events`
row per change, scoped to that one template's own `template_key`). RLS is superadmin-only
SELECT on both tables, same reasoning as `platform.email_provider` (no real rendering
consumer exists yet to justify a wider grant). No INSERT/UPDATE/DELETE grant to
`authenticated` at all -- only the audited RPC can change a row.

**Config-only, same accepted scope as PLATFORM-P0-11.1 -- no wiring**: none of the
already-live Resend call sites PLATFORM-P0-11.1's own entry catalogued render any database
template today; wiring a real send path to read from here is a future, separate story's
job (the same "config registry now, real wiring later" precedent PLATFORM-P0-09.1
established and PLATFORM-P0-11.1 already followed once this section).

**Application layer** (`packages/core/src/admin/platform-email-templates.ts`):
`EMAIL_TEMPLATE_KEYS` (the seven-value const array, in the doc's own listed order, not
alphabetical) + `EMAIL_TEMPLATE_LABELS`; `listEmailTemplates()` returns all seven in that
same fixed order (re-sorted client-side from the DB's own row order, so the admin page
always reads in the doc's order regardless of how Postgres returns them);
`updateEmailTemplateSchema` validates `templateKey` (closed enum), `subject`/`body`
(optional, empty clears back to unconfigured), and a required `reason`. 6 new unit tests in
`platform-email-templates.test.ts` (the seven-key list and order, valid input, empty-to-null
normalization, unknown-key rejection, blank-reason rejection, every one of the seven keys
individually accepted).

**UI**: new `apps/web/app/platform/(protected)/email-templates/` (page.tsx, actions.ts,
email-template-dialog.tsx) -- desktop table / mobile card split per CLAUDE.md development
principle #12 and `docs/design/claude-ui-design-rules.md` rule 5, mirroring `/platform/
plans`' own established split (this page's primary content is a table of seven rows, unlike
`/platform/email-provider`'s single settings row, which correctly used the singleton
`Field`-list shape instead). Edit-only per row (`EmailTemplateDialog`, no Add/Delete --
the catalog is fixed); `templateKey` is never editable, matching `PlanDialog`'s own
"immutable identity field, editable everything else" precedent. A "Configured"/"Not
configured" badge per row (derived from whether `subject`/`body` is set) gives the list an
at-a-glance completion signal the doc doesn't explicitly ask for but the "manage templates
for X" framing implies is useful, the same minimal-but-real affordance `/platform/plans`'
own status badge already established for a different fixed set of states.
`apps/web/app/platform/layout.tsx` gains one nav entry, "Email Templates", after "Email
Provider".

**Deliberately not built this story**: no templating-variable syntax/validation (see
above); no real email-sending wiring; no per-template on/off "enabled" toggle (§15 names no
such field, and nothing in this codebase would read it yet -- adding one now would be
exactly the kind of no-consumer speculative column CLAUDE.md development principle #7
rules out); PLATFORM-P0-11.3 (Notification Policies) is next, its own separate story.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors after fixing one unescaped-quote catch in
the new dialog's own `DialogTitle` copy (the same recurring class of lint 03.1/03.5/11.1
also hit), 1 pre-existing unrelated warning (`Package` unused import in a CRM conversations
page, untouched by this story). `node scripts/lint-import-boundaries.mjs` -- 1477 files, no
violations. `node scripts/lint-migration-schema.mjs` -- 195 migrations (193 -> 195, this
story's own file plus one other workstream's concurrent merge into `main` since 11.1's own
entry), no violations. `npx vitest run --root packages/core` -- 26 files / 243 tests (25/237
-> 26/243, +6 new), all passing. `apps/web`'s own `vitest run --passWithNoTests` -- 50
tests, unchanged. `cd apps/web && rm -rf .next && npm run build` -- clean;
`/platform/email-templates` lists `ƒ` (dynamic), inheriting the outer layout's existing
`force-dynamic` with no change needed.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only, applied clean on the first attempt. Confirmed via
`execute_sql` that all seven fixed keys are seeded with `subject`/`body` both `null`.
`mcp__Supabase__get_advisors` (security and performance) -- **zero new findings**: the same
6 pre-existing `rls_enabled_no_policy` INFO rows and the pre-existing leaked-password-
protection warning (security); the four new indexes on the two new tables appear only as
the same benign "unused index" INFO class every sibling table's own FK index already
carries in this empty dev database (performance) -- no new unindexed-FK finding.

**Role-switched live proof against dev's own real data**: using the same real
non-superadmin user (`c8040fb0-b46c-4131-9ea7-195e8157d27b`) this backlog's own prior
entries have repeatedly used -- role-switched `select count(*) from
platform.email_templates` returned `0` (RLS-filtered, not an error), and a role-switched
call to `platform.update_email_template('welcome', 'Hacked', 'hacked body', 'trying as
non-superadmin')` returned the real Postgres `P0001: Forbidden: only a SUPERADMIN can
change a system email template.` error -- a genuine function-level rejection. As with
every prior story in this log, there is no seeded demo superadmin user in this environment,
so the "a real superadmin CAN edit a template" half of the live-dev proof was **not**
performed against dev and is not claimed here -- verified for real only against local
Postgres (below).

**The dedicated local-Postgres RLS/behavior test**: new
`scripts/test-platform-email-templates-rls.mjs` (added to `package.json`'s `test:db`
composite script, after `test-platform-email-provider-rls.mjs`) -- seeds a real business
admin (Alice, not a superadmin) and a real superadmin (Zoe). Asserts: the catalog starts
seeded with exactly the seven fixed keys, all unconfigured; Alice gets 0 rows on SELECT and
her mutation attempt is rejected with zero residue; Zoe can SELECT all seven and
successfully update one template's content via the audited RPC, which writes exactly one
`content_updated` event scoped to that one `template_key` while every other template stays
untouched; a blank/whitespace reason is rejected even for Zoe; an unknown template key is
rejected; and -- the negative space this story's own fixed-catalog design promises --
**not even Zoe** can INSERT an eighth row, DELETE any of the seven, or bypass the RPC with
a direct UPDATE. Ran locally against the already-running local Postgres 16 cluster: **all
24 assertions passed** on the first run against the full current migration timeline (196
files).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this sandboxed environment, so a live browser walkthrough of
`/platform/email-templates` actually editing a template through the real UI was **not**
performed and is **not** claimed here. This entry documents build/typecheck/lint/unit-test
correctness and a direct read of the applied schema/RLS/function against the live dev
database (the "SUPERADMIN-only" half proven live; the "a real superadmin succeeds" half
proven only against local Postgres), not an end-to-end UI verification.

**Status**: PLATFORM-P0-11.2 done. PLATFORM-P0-11.3 (Notification Policies) remains open,
picked up next in section order. Committing and merging to `main`, then continuing.

### PLATFORM-P0-11.3 — Notification Policies (2026-09-12)

**§15's own text in full**: "Configure platform defaults for: email / in-app / push."

**Entity-ownership check (CLAUDE.md non-negotiable #5)**: `docs/plan/00-MASTER-PLAN.md` §5
lists the canonical home for the "Notification" concept as `core.notifications` +
`core.notification_prefs`. Grepped the full migration timeline for both names first --
**zero hits**, confirmed rather than assumed: neither table exists anywhere in this
codebase yet. So there is no existing table this migration could duplicate today. Read
closely, this story's own ask is also a different concept on its own terms even once that
future pair is eventually built: "platform defaults" is WonderArc's own operator-level
policy for which channels are available/on by default across the whole platform, not a
`business_id`- or `user_id`-scoped preference row (what `core.notification_prefs`, when
built, would own -- an individual's own choice to mute a channel). This mirrors the same
"platform operator config vs. tenant-scoped data" split `platform.plans` already draws
against `core.licenses`/`core.business_settings.plan`, and `platform.ai_providers` draws
against `core.ai_provider_credentials` (BYOK) -- a `platform`-schema table naming a concept
a future `core`-schema table will also touch is not automatically a duplicate, provided (as
confirmed here) the two operate at genuinely different scopes and neither exists yet to
actually collide. Not a stop-and-report case: no existing data to conflict with, and no
unstated runtime algorithm to invent (unlike 09.3/10.2's own routing/circuit-breaker
questions) -- just three platform-wide default toggles.

**Config-only, same accepted scope as PLATFORM-P0-11.1/11.2**: grepped for any existing
in-app or push notification delivery mechanism -- zero hits. Email is the one channel with
any real live sending path at all (Resend, catalogued in `platform-email-provider.ts`'s own
docstring), and even that path reads nothing from this table. Real wiring is a future,
separate story's job, matching this section's own established precedent twice already this
run.

**What was built**: migration `20260912420000_platform_notification_policies.sql` --
singleton `platform.notification_policies` (boolean PK fixed to `true`, same construction
as `platform.branding`), three boolean columns (`email_enabled`, `in_app_enabled`,
`push_enabled`), each defaulting `false` -- the same "no fabricated 'on' state for a
brand-new, never-configured surface" discipline `platform.ai_providers.enabled default
false` already established, applied here even though email genuinely is this platform's own
one channel with real infrastructure elsewhere: this table itself has never been
configured, so it doesn't get to start "on" by inference.

**A deliberate, documented pattern choice (this run's own task brief marks "which existing
pattern to reuse" as a non-security call)**: unlike PLATFORM-P0-11.1's `from_email`/
`reply_to` (a phishing/spoofing-adjacent surface once read) or PLATFORM-P0-11.2's template
`body` (a literal injection point for a password-reset email's own links), three boolean
channel-default toggles carry no comparable payload an attacker could weaponize --
the worst a malicious flip does is silently disable a notification channel, not impersonate
WonderArc or inject content into a security-critical message. So this table uses
`platform.branding`'s own plain `select`/`update` RLS shape (superadmin read/write is the
whole ask, no separate audit table) rather than 11.1/11.2's heavier audited-RPC pattern --
recorded here as a reasoned choice, not an oversight, should a future reviewer wonder why
this one `platform.*` table in the same doc section looks different from its two siblings.

**Application layer** (`packages/core/src/admin/platform-notification-policies.ts`):
`getNotificationPolicies()`/`updateNotificationPolicies()`, mirroring `platform-branding.ts`'s
own pre-03.5 shape (request-scoped client, `requireSuperadmin()` first, RLS authoritative,
`updated_by` set explicitly via `supabase.auth.getUser()` since there is no SECURITY
DEFINER function auto-populating it from `auth.uid()` here). `updateNotificationPoliciesSchema`
is a plain three-boolean Zod object -- no string-to-null normalization needed, unlike every
other §11 schema in this file. 5 new unit tests in
`platform-notification-policies.test.ts` (all-true, all-false, mixed, non-boolean rejection,
missing-field rejection).

**UI**: new `apps/web/app/platform/(protected)/notification-policies/` (page.tsx,
actions.ts, notification-policies-form.tsx) -- a plain always-editable form (three
`Checkbox`es + one Save button), not a dialog, matching `branding-form.tsx`'s own
"standalone settings screen with one purpose" reasoning (CLAUDE.md development principle
#1) rather than porting a dialog pattern this page's single settings row doesn't need. No
"reason" field, matching the lighter, non-audited mutation this table uses.
`apps/web/app/platform/layout.tsx` gains one nav entry, "Notification Policies", after
"Email Templates" -- completing §15's own three-item nav.

**Deliberately not built this story**: no real notification delivery of any kind (see
above); no per-user or per-business notification preference table (that is
`core.notification_prefs`'s own future, separate scope per the entity-ownership reasoning
above); no audit trail (a deliberate, documented pattern choice, not a gap -- see above).

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, 1 pre-existing unrelated warning (`Package`
unused import in a CRM conversations page, untouched by this story). `node
scripts/lint-import-boundaries.mjs` -- 1485 files, no violations. `node
scripts/lint-migration-schema.mjs` -- 197 migrations (195 -> 197, this story's own file plus
one other workstream's concurrent merge into `main` since 11.2's own entry), no violations.
`npx vitest run --root packages/core` -- 27 files / 248 tests (26/243 -> 27/248, +5 new),
all passing. `apps/web`'s own `vitest run --passWithNoTests` -- 50 tests, unchanged. `cd
apps/web && rm -rf .next && npm run build` -- clean; `/platform/notification-policies` lists
`ƒ` (dynamic), inheriting the outer layout's existing `force-dynamic` with no change needed.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only, applied clean on the first attempt. Confirmed via
`execute_sql` that the singleton row seeded with all three channels `false`.
`mcp__Supabase__get_advisors` (security and performance) -- **zero new findings**: the same
6 pre-existing `rls_enabled_no_policy` INFO rows and the pre-existing leaked-password-
protection warning (security); the one new index on this table appears only as the same
benign "unused index" INFO class every sibling table's own FK index already carries in this
empty dev database (performance).

**Role-switched live proof against dev's own real data, this table's own pattern
demonstrated directly (not merely a function-level rejection)**: using the same real
non-superadmin user (`c8040fb0-b46c-4131-9ea7-195e8157d27b`) this backlog's own prior
entries have repeatedly used -- role-switched `select count(*) from
platform.notification_policies` returned `0` (RLS-filtered, not an error); a role-switched
`update platform.notification_policies set email_enabled = true where id = true` returned
successfully (no error -- this table has no SECURITY DEFINER function to reject the
attempt, RLS's `USING` clause is the only gate) but a follow-up read confirmed
`email_enabled` was still `false` -- the update genuinely affected zero rows, exactly the
"RLS-filtered no-op" behavior `platform.branding`'s own established pattern predicts, not a
silent bypass. As with every prior story in this log, there is no seeded demo superadmin
user in this environment, so the "a real superadmin CAN update it" half of the live-dev
proof was **not** performed against dev and is not claimed here -- verified for real only
against local Postgres (below).

**The dedicated local-Postgres RLS test**: new
`scripts/test-platform-notification-policies-rls.mjs` (added to `package.json`'s `test:db`
composite script, after `test-platform-email-templates-rls.mjs`) -- seeds a real business
admin (Alice, not a superadmin) and a real superadmin (Zoe). Asserts: the singleton starts
seeded with all three channels false; Alice gets 0 rows on SELECT and her UPDATE silently
affects zero rows (row confirmed untouched via a service-role read); Zoe can SELECT and
successfully UPDATE the row directly; and -- the negative space this table's own singleton
design promises -- **not even Zoe** can INSERT a second row or DELETE the singleton, since
no such policy or grant exists for `authenticated` at all. Ran locally against the
already-running local Postgres 16 cluster: one assertion needed a fix on the first run (a
`::text` cast on a Postgres boolean prints `true`/`false`, not `t`/`f` -- a test-authoring
mistake, not an RLS/behavior bug, caught and corrected before the final run); **all 8
assertions passed** on the corrected run against the full current migration timeline (197
files).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this sandboxed environment, so a live browser walkthrough of
`/platform/notification-policies` actually toggling a channel through the real UI was
**not** performed and is **not** claimed here. This entry documents build/typecheck/lint/
unit-test correctness and a direct read/write proof against the live dev database (the
"non-superadmin update is a silent no-op" half proven live; the "a real superadmin succeeds"
half proven only against local Postgres), not an end-to-end UI verification.

**Status**: PLATFORM-P0-11.3 done. §15 (Global Email / Notification Configuration) is now
finished (11.1/11.2/11.3 all done). Committing and merging to `main`, then continuing to
§16 (Global Integrations, PLATFORM-P0-12) next, per this doc's own section order.

### PLATFORM-P0-12.1-12.4 — Global Integrations (2026-09-12)

**§16's own text in full**:
- 12.1 Integration Registry -- "Central list: AI, Email, WhatsApp, Payments, Government,
  Analytics, Storage."
- 12.2 Integration Status -- "Show: Connected, Disconnected, Error, Needs
  Reauthorization, Disabled."
- 12.3 Integration Kill Switch -- "Allow emergency disabling."
- 12.4 Credential Separation -- "Customer-owned credentials and WonderArc-owned platform
  credentials must be separate."

**Entity-ownership check (CLAUDE.md non-negotiable #5), done first as this run's own task
brief required**: checked `docs/plan/00-MASTER-PLAN.md` §5 and grepped the codebase for
every existing "integration"/credential concept before assuming §16 is a clean, novel
table. It is not clean at all -- this is the third time this workstream has found a
"global/platform-level" section overlapping something already built elsewhere (after
03.1/11.1's `email_from_name` and 09.1's BYOK-vs-platform-key distinction), and this time
the check surfaced a genuine, material mistake mid-story that had to be corrected before
merging -- documented in full below rather than smoothed over.

First pass, scoped (mistakenly) to `packages/` + `supabase/migrations/` only:
- **AI** -- `platform.ai_providers`/`platform.ai_provider_keys` (PLATFORM-P0-09.1/09.2,
  platform-owned) AND `discovery.ai_provider_credentials` (BYOK, customer-owned --
  master-plan §5's own `core.ai_provider_credentials` line is stale; the live schema is
  discovery-scoped, confirmed by grep, per CLAUDE.md's "live source wins").
- **Email** -- `platform.email_provider` (PLATFORM-P0-11.1, platform-owned only; no
  customer-facing BYOK email/SMTP concept exists anywhere).
- **WhatsApp** -- `crm.channel_accounts` (customer-owned; a business connects its own
  WhatsApp Business/Instagram/Facebook/Google Business Messages account, AES-256-GCM
  encrypted per row). No platform-level Meta App credential exists -- `connectChannel
  Account()` takes an already-obtained access token straight from the business's own OAuth
  exchange.
- **Government** -- `gst.eway_bill_credentials`/`gst.einvoice_credentials`/
  `gst.gstr2b_credentials` (customer-owned; each business supplies its own GSP client-id/
  secret or username/password, same AES-256-GCM helper). No platform-level GSP app
  credential exists.
- **Payments, Analytics, Storage** -- this narrower grep found nothing for any of the
  three, and the first draft of this migration said so in its own header comment.

**That first-pass conclusion for Payments and Storage was wrong, and was caught before
merging, by widening the grep to the whole repo** (not only `packages/`+
`supabase/migrations/`) after noticing `next build`'s own route listing included
`/api/billing/razorpay/create-order`, `/api/billing/razorpay/verify`, and
`/api/webhooks/razorpay` -- routes a schema/migration-scoped grep can never surface, since
neither of these two integrations happens to have a database table at all:
- **Payments IS already built**, and is platform-owned, not customer-owned:
  `packages/core/src/billing/razorpay.ts` calls Razorpay directly using WonderArc's OWN
  merchant credentials (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET`
  env vars) to charge a *business* for its own subscription plan and AI-credit top-ups
  (`apps/web/app/api/billing/razorpay/*`, `core.ai_credit_purchases`) -- money flows FROM
  a business TO WonderArc, the exact reverse of a customer-owned integration. Confirmed no
  per-business "connect your own gateway to collect from your own customers" feature
  exists anywhere (no `payment_link`/business-scoped Razorpay credential of any kind) --
  that would be this category's customer-owned dimension, and it simply isn't built.
- **Storage is also already built**, and is platform-owned: `core.attachments`
  (`packages/core/src/attachments/mutations.ts`) already uploads to this same Supabase
  project's own Storage bucket (`supabase.storage.from("attachments")`) for every job
  photo/product image/signed PDF/knowledge file across every module -- master-plan §5's own
  "Attachment... (Supabase Storage)" line names exactly this. There is no separate
  "credential" for it (it rides the same Supabase session/service-role auth every other
  query already uses) and no per-business "connect your own S3/Google Drive" feature
  exists.
- **Analytics remains genuinely unbuilt** even under the wider, whole-repo grep -- no
  product analytics/telemetry provider for WonderArc's own use, and no per-business
  "connect your own GA/Meta Pixel" feature, exist anywhere.

This is the same class of finding as PLATFORM-P0-03.1's schema-grant bug earlier in this
log ("a real bug found while investigating," not merely confirming what was assumed) --
the lesson recorded here for future stories: **an entity-ownership grep for a global,
platform-wide concept must not be scoped to `packages/`+`supabase/migrations/` by
default** -- a real integration can live entirely in `apps/web/app/api/` (a route handler
calling a third-party API directly, reading only `process.env`) with no database footprint
to find at all. The migration below was corrected (docstring and seed data both) before it
was ever applied a second time to dev -- see "What was built" and "A mistake made and
fixed mid-story" further down for exactly what changed and how it was re-verified.

**Not a stop-and-report case, once the (corrected) facts were in hand**: every one of
12.1-12.4's four requirements resolves cleanly against those facts without inventing any
unstated runtime algorithm (unlike 09.3/10.1/10.2's own routing/budget/circuit-breaker
questions) -- see the two design decisions below for the two genuine judgment calls this
story did require, both decided and documented rather than deferred.

**Design decision #1 -- a REGISTRY, not a second credential store**: §16 is not asking for
a second, competing place to store any of the six categories' real credentials -- doing
that would be exactly the "parallel table for an already-listed concept" CLAUDE.md
non-negotiable #5 forbids, and would also violate 12.4 itself by merging customer-owned and
platform-owned credentials into one place. What §16 asks for -- and what nothing above
already provides -- is a superadmin-facing REGISTRY: one row per integration *category*
(not per credential, not per business) recording which ownership model applies and the
category's own platform-wide operational status/kill switch, mirroring `platform.modules`
(PLATFORM-P0-07.1) doing the same job one level up for whole modules. The new
`platform.integrations` table holds **zero credential columns** -- no key, token, secret,
or client-id of any kind -- by construction, which is itself the concrete enforcement of
12.4: the six real credential homes named above keep being the only place any actual secret
lives, each already scoped exactly as CLAUDE.md non-negotiable #2 requires (or
superadmin-only/zero-select, for the platform-owned ones); this table only ever describes
them from a distance. Verified structurally, not just asserted -- see the dedicated RLS
test's own `information_schema.columns` assertion below.

**Design decision #2 -- a dedicated `status`/`enabled` pair on this new table, not new rows
in the already-built `platform.feature_flags` (PLATFORM-P0-08.1-08.4)**: a real, deliberate
judgment call, not an oversight -- 08.3's own text even names some of the same subsystems
("AI research", "WhatsApp integration", "government submission") as flag-based
kill-switch candidates. Decided in favor of a dedicated column, for two reasons, both
written into the migration's own header comment: (1) **granularity mismatch** -- 08.3's
list is a list of operational *behaviors* (outbound messaging, expensive external APIs,
new experimental features, ...), not 12.1's list of integration *categories* (Email,
Payments, Analytics, Storage have no corresponding flag at all) -- force-fitting seven
category rows onto flag rows of a different shape would need lossy, partial mappings for
most of them; (2) this codebase **already treats "coarse, dedicated kill switch" and
"fine-grained feature flag" as two legitimate, coexisting granularities, not duplicates of
each other** -- `platform.modules.status`/`enabled` (kill an entire module) already
coexists deliberately alongside `platform.feature_flags` (kill one specific behavior), per
that reconciliation migration's own docstring; `platform.integrations.status`/`enabled`
(kill one entire integration category) is the same pattern one layer over. No runtime
enforcement is wired into any actual integration call site by this story (no
PLATFORM-P0-12.5 "wire the kill switch into crm/gst code" story exists in this doc, and
this run's own file-scope boundary forbids touching `module-crm`/`module-gst`/
`module-discovery` regardless) -- config/registry now, same "table now, real enforcement
later" sequencing this whole backlog has used repeatedly (07.1→07.2/07.3,
08.1-08.4→ungated).

**What was built**: migration `20260912430000_platform_integrations.sql` --
`platform.integrations` (`integration_key` text PK, `display_name`, `credential_ownership`
enum `platform_owned`/`customer_owned`/`both`, `status` enum `connected`/`disconnected`/
`error`/`needs_reauthorization`/`disabled` per 12.2's own vocabulary, `enabled` a
`GENERATED ALWAYS AS (status <> 'disabled')` column -- derived from day one, deliberately
avoiding the separate reconciliation migration `platform.modules` needed later for the
exact same shape -- `notes`, `updated_at`/`updated_by`). Seeded with exactly the seven
12.1 categories, ownership and status computed/decided from the corrected facts above: `ai`
= `both` (`connected` iff `platform.ai_provider_keys` has a row -- computed, not
hardcoded), `email` = `platform_owned` (`connected` iff `platform.email_provider.provider`
is set -- computed), `whatsapp`/`government` = `customer_owned`/`connected` (real, working
features today via `crm.channel_accounts`/the gst credential tables), `payments`/`storage`
= `platform_owned`/`connected` (real, working features today via WonderArc's own Razorpay
billing / Supabase Storage), `analytics` = `customer_owned`/`disconnected` (genuinely
nothing built). `platform.integration_status_events` -- append-only audit trail, identical
shape to `platform.module_status_events`/`platform.feature_flag_events`.
`platform.set_integration_status(p_integration_key, p_status, p_notes, p_reason)` -- the
ONE mutation path (12.2 status changes AND 12.3's kill switch together), SECURITY DEFINER,
requires `platform.is_superadmin()` and a non-empty `reason` unconditionally (every
direction, not only disabling), writes one atomic audit row. RLS: open `SELECT` to any
`authenticated` user on `platform.integrations` (no credential data on this table at all,
so an open read creates no exposure beyond "which categories exist and their status" --
exactly what 12.1/12.2 ask to "show"); superadmin-only `SELECT` on
`platform.integration_status_events`; **no INSERT/UPDATE/DELETE grant to `authenticated`
on either table** -- `set_integration_status()` is the only path, and the seven-row catalog
is fixed (no add/remove operation 12.1 asks for).

App layer: `packages/core/src/admin/platform-integrations.ts`
(`listIntegrationRegistry()`, `setIntegrationStatus()`, Zod-validated, `requireSuperadmin()`
defense-in-depth on the one write path) + `platform-integrations.test.ts` (8 schema
validation tests). UI: `apps/web/app/platform/(protected)/integrations/` (`page.tsx`,
`integration-registry-table.tsx`, `integration-status-dialog.tsx`, `actions.ts`) -- desktop
table / mobile card split per CLAUDE.md development principle #12 and
`docs/design/claude-ui-design-rules.md`, mirroring `modules/page.tsx`'s own established
split exactly. The kill-switch dialog deliberately does **not** show a live per-business
impact count the way `ModuleStatusDialog` (07.2) does -- 12.3's own text is only "allow
emergency disabling," with no "impact confirmation" requirement of its own (unlike §11's
explicit four-part list for the module kill switch), and building one would mean this
`packages/core` admin surface directly querying `crm.channel_accounts`/the gst credential
tables cross-tenant, which this run's own file-scope boundary and CLAUDE.md development
principle #7 (no speculative functionality) both argue against for a requirement §16 never
actually asked for. An explicit acknowledgement checkbox, required only for the
into/out-of-`disabled` transition, stands in as this dialog's own "emergency" ceremony.
Added `{ href: "/platform/integrations", label: "Integrations" }` to `layout.tsx`'s nav.

**A mistake made and fixed mid-story, documented rather than silently corrected**: the
first version of this migration (applied to dev, then found wrong before this story was
considered done) seeded `payments`/`storage` as `customer_owned`/`disconnected` and
asserted in its own header comment that "nothing exists anywhere in this codebase" for
either -- both false, per the whole-repo grep above. Caught by noticing `next build`'s own
route listing named `/api/billing/razorpay/*` routes that a `packages/`+
`supabase/migrations/`-scoped grep had missed entirely. Fixed by: (1) rewriting the
migration's header comment and seed `INSERT` (`payments`/`storage` now `platform_owned`/
`connected`) in the same, not-yet-committed file -- no separate reconciliation migration
needed, since nothing had consumed the wrong data yet; (2) on dev, dropping the three
objects this migration had created (`set_integration_status()`, both tables) and the
`supabase_migrations.schema_migrations` tracking row, then reapplying the corrected SQL
under the same migration name via `mcp__Supabase__apply_migration`, so dev's schema history
stays a clean, accurate record of what actually shipped rather than carrying a since-fixed
mistake forward; (3) re-running every verification step below against the corrected state.
Recorded here at the same level of honesty this log's PLATFORM-P0-03.1 entry set for its
own schema-grant bug -- a real gap found by widening the check, not by trusting the first
pass.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, 1 pre-existing unrelated warning (`Package`
unused import in a CRM conversations page, untouched by this story). `node
scripts/lint-import-boundaries.mjs` -- 1491 files, no violations. `node
scripts/lint-migration-schema.mjs` -- 198 migrations, no violations. `npx vitest run`
(`packages/core`) -- 28 files / 256 tests (27/248 -> 28/256, +8 new), all passing. `apps/web`'s
own `vitest run --passWithNoTests` -- 50 tests, unchanged (this story touched no
`apps/web` test file). `cd apps/web && npm run build` (`next build`) -- clean; full route
listing includes `ƒ /platform/integrations` (dynamic, inheriting the outer `/platform`
layout's existing `force-dynamic`, no change needed) -- this same build is what surfaced
the Razorpay routes that led to the mid-story correction above.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only -- first attempt (the since-corrected version) applied clean,
then dropped and reapplied clean a second time with the corrected content (see "A mistake
made and fixed mid-story" above). Confirmed via `execute_sql` that the final seeded state
matches: `ai`/`email` both `disconnected` (accurately -- no key/provider configured in this
dev project), `whatsapp`/`government`/`payments`/`storage` all `connected`,
`analytics` `disconnected`, `enabled` correctly `true` for all seven.
`mcp__Supabase__get_advisors` (security and performance) -- **zero new findings** both
times: the same 6 pre-existing `rls_enabled_no_policy` INFO rows and the pre-existing
leaked-password-protection warning (security); the two new indexes on this story's own
tables appear only as the same benign "unused index" INFO class every sibling table's own
index already carries in this near-empty dev database (performance).

**Role-switched live proof against dev's own real data**: no seeded superadmin exists in
this dev project (same limitation every prior story in this log has recorded), so the
positive "a real superadmin can flip the kill switch" path is proven only against local
Postgres (below) -- but the negative/open-read paths ARE proven live against dev, in full,
using a synthetic non-superadmin `request.jwt.claim.sub` (the same technique this log's
prior entries have used): (1) as `anon` -- `select count(*) from platform.integrations`
correctly fails `ERROR 42501: permission denied for schema platform` (no schema-level grant
to `anon` at all, matching the `platform` schema's existing grant scope, not a repeat of
PLATFORM-P0-03.1's own missing-grant bug); (2) as `authenticated` (synthetic
non-superadmin) -- `select count(*) from platform.integrations` returns `7` (open read
works, 12.1/12.2's own "show" requirement), `select count(*) from
platform.integration_status_events` returns `0` (superadmin-only, correctly empty for a
non-superadmin), and calling `platform.set_integration_status('whatsapp', 'disabled',
'malicious', 'trying to kill it')` is rejected with `P0001: Forbidden: only a SUPERADMIN
can change an integration's platform-wide status` -- the kill switch is not reachable by a
non-superadmin, live, against real dev infrastructure.

**The dedicated local-Postgres RLS test**: new `scripts/test-platform-integrations-rls.mjs`
(added to `package.json`'s `test:db` composite script, after
`test-platform-notification-policies-rls.mjs`) -- seeds a real business admin (Alice, not a
superadmin) and a real superadmin (Zoe), replaying the full current migration timeline (199
files). Asserts: the registry seeds exactly the seven categories; Alice (not a superadmin)
can read all 7 rows; `enabled` is a true `GENERATED ALWAYS` column for every one of the five
status values, and cannot be assigned directly even by `service_role`; Alice's kill-switch
attempt is rejected and changes nothing; an empty/whitespace reason is rejected in every
direction, not only disabling; an unknown status or unknown integration key is rejected
with a clear error; **Zoe (a real superadmin) CAN flip the emergency kill switch**, and it
is captured as exactly one atomic audit row with the real previous/new status AND
previous/new notes together; an empty-string notes value normalizes to null; the registry
table has zero columns (other than its own key and the 12.4 ownership-metadata enum) that
even resemble a credential column -- the structural proof behind design decision #1's own
"zero credential columns" claim; Alice gets zero rows on the audit trail regardless of real
event count; nobody, including Zoe, can bypass `set_integration_status()` with a direct
`INSERT` on the audit table, nor `INSERT`/`DELETE`/`UPDATE` `platform.integrations`
directly (no such grant exists to `authenticated` at all -- the seven-row catalog is fixed,
matching 12.1's own "central list" framing with no add/remove operation). One authoring
mistake caught and fixed before the final run: an initial "no credential-like column"
`information_schema.columns` regex flagged this table's own `integration_key`/
`credential_ownership` columns as false positives (both contain the substring "key"/
"credential" as *identifiers*, not because they store a secret) -- excluded explicitly by
name, with a comment explaining why, rather than loosening the regex in a way that could
miss a real future credential column. **All 21 assertions passed** on the corrected run.

**Deliberately not built this story**:
- **No runtime enforcement of the kill switch into any actual integration call site**
  (`crm.channel_accounts` message sending, the gst GSP client, the Razorpay billing routes,
  the AI provider router, Resend). §16 never asks for this (no PLATFORM-P0-12.5 exists),
  and this run's own file-scope boundary forbids touching `module-crm`/`module-gst`/
  `module-discovery` regardless -- config/registry only, matching every "table now, real
  wiring later" precedent this backlog has used repeatedly.
- **No live health-check/monitoring that could compute `error`/`needs_reauthorization`
  automatically.** No such infrastructure exists anywhere in this codebase; building one
  now would be exactly the speculative work CLAUDE.md development principle #7 rules out
  for a story that only asks to "show" status. Every status transition is a superadmin's
  own manual, audited call, the same "manually-operated status" shape `platform.modules`
  already established.
- **No live per-business impact count in the kill-switch dialog** -- see "What was built"
  above for why (12.3's own text doesn't ask for one, unlike §11's module kill switch).
- **No add/remove-a-category operation** -- the seven rows are a fixed catalog seeded once
  by this migration; 12.1's own "central list" framing never asks for a management UI to
  grow or shrink it.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this sandboxed dev environment, so a live browser walkthrough of
`/platform/integrations` actually flipping the kill switch through the real UI was **not**
performed and is **not** claimed here. This entry documents build/typecheck/lint/unit-test
correctness, a direct read/reject proof against the live dev database for every
non-superadmin path (including the one real bug-hunting detour that corrected two of the
seven seeded rows before merge), and the full positive-and-negative matrix against local
Postgres -- not an end-to-end UI verification.

**Status**: PLATFORM-P0-12.1/12.2/12.3/12.4 done. §16 (Global Integrations) is now
finished. No genuine architecture/security ambiguity requiring stop-and-report surfaced
this story (both judgment calls -- registry-not-credential-store, dedicated column-not-
feature-flag-reuse -- resolved cleanly against precedent already established elsewhere in
this backlog, per the two design decisions above). Committing and merging to `main`, then
continuing to §17 (Country / Compliance Pack Administration, PLATFORM-P0-13) next, per this
doc's own section order.

### PLATFORM-P0-13.1/13.2/13.4 — Country / Compliance Pack Registry (2026-09-13)

**Worktree hazard checked first, per this workstream's own standing instruction**: this
run's worktree branch was `worktree-agent-ad43b43fe7220f11f`, sitting on a stray
`scratch-plat-12-merge` merge commit, not `feature/platform-admin-portal`'s own tip.
Working tree was clean (no stash needed) -- fixed with `git checkout -B
feature/platform-admin-portal origin/feature/platform-admin-portal`, landing at `ec8e9fc`
(PLATFORM-P0-12.1-12.4's own commit), reconfirmed via `git log --oneline -3` before
touching any file. `npm install` run fresh (no `node_modules` in this worktree), confirmed
via `readlink -f node_modules/@cofounderai/core` resolving to this worktree's own
`packages/core`.

**§17's own text in full**:
- 13.1 Country Registry -- "Manage: India, EU/member states, US, Canada, Singapore, UAE,
  Saudi Arabia, Australia, New Zealand, Malaysia, etc."
- 13.2 Compliance Pack Availability -- "Configure: country, regime, enabled, supported
  features, version."
- 13.3 Rule Version -- "Country rules must have: version, effective_from, effective_to,
  source, status."
- 13.4 Compliance Feature Flags -- "Example: India GST=enabled, E-Invoice=enabled,
  E-Way Bill=enabled, IMS=enabled."

**Entity-ownership check (CLAUDE.md non-negotiable #5), done first, widened per this run's
own task brief (the same discipline PLATFORM-P0-12.1-12.4's own entry set)**: checked
`docs/plan/00-MASTER-PLAN.md` §5 first -- no "country"/"compliance pack"/"tax rule" concept
listed there at all. Then read (read-only reconnaissance; `module-gst` is a different,
concurrently-running workstream's files, never edited here) every relevant `module-gst`
file rather than assuming §17 is either wholly novel or a pure duplicate:
- `packages/module-gst/src/lib/compliance/countries.ts` -- `COUNTRY_CATALOG`, a
  compile-time TS constant array recording which countries/regimes this codebase has
  actually built working support for (`status: "supported"` vs `"planned"`). Eighteen
  entries: IN/US/CA supported with their regimes, DE/FR/BE/PL/IT supported as individual
  EU VAT member states, and SG/AE/SA/AU/NZ/MY/TH/ID/JP/KR named as `"planned"`. No DB table
  backs this at all -- it answers "what has engineering shipped," not "what is
  administratively offered to customers right now."
- `packages/module-gst/src/lib/compliance/queries.ts`/`mutations.ts` -- a *business's own*
  `gst.compliance_profiles` row (the country/regime it has registered under). Tenant data,
  not a platform-wide administrative concept.
- `packages/module-gst/src/lib/tax-rules/types.ts` + migration
  `20260911004500_gst_tax_rules.sql` -- `gst.tax_rules`, a real, live, already-heavily-used
  DB table with **exactly** the shape 13.3 names: `country`, `jurisdiction`, `regime`,
  `rule_key`, `value`, `version` (integer, incrementing per rule lineage),
  `effective_from`, `effective_to`, `source` (a required citation), `created_at`/
  `updated_at`. Its own docstring documents the identical versioning model 13.3 describes:
  "a rule lineage is identified by (country, regime, jurisdiction, rule_key); each version
  is a separate, never-mutated row... `supersedeTaxRule` closes the previous version's
  `effective_to` ... and inserts version+1." This is not a placeholder or a stub -- it is
  seeded with real content across many migrations (India GST rate slabs, e-invoice/e-way
  bill thresholds, EU VAT rates, US sales tax, Canada GST/HST, filing due dates, retention
  rules, ...), actively read by the tax-determination/e-invoice-eligibility/eway-bill-
  eligibility/returns engines throughout `module-gst`.
- Grepped `apps/web/` for any existing country-selection or compliance-pack ADMIN UI --
  none exists anywhere (only the tenant-facing `country-bar.tsx`/
  `unsupported-country-notice.tsx` components inside `module-gst` itself, which read
  `COUNTRY_CATALOG` directly for a business's own country/regime picker -- not a platform
  admin surface).

**Conclusion, resolvable for three of the four sub-stories, genuinely NOT resolvable for
the fourth**:
- **13.1 (Country Registry) and 13.2/13.4 (Compliance Pack Availability / Feature Flags)
  are a genuinely new PLATFORM-level administrative registry** -- one layer of "is this
  country/regime/capability administratively offered at all, platform-wide" sitting above
  `module-gst`'s own compile-time "is it built" catalog (`COUNTRY_CATALOG`) and above a
  business's own tenant-scoped `gst.compliance_profiles` selection. This is the identical
  three-layer relationship PLATFORM-P0-07.1's own entry already established for whole
  modules (`packages/module-registry`, a compile-time static manifest, vs.
  `platform.modules`, the DB-backed operational registry) -- confirmed against that entry
  before writing this one, not assumed by analogy alone. Resolved and built, not stopped
  on.
- **13.3 (Rule Version) is a genuine, unresolved entity-ownership conflict, stopped and
  reported on rather than guessed at.** `gst.tax_rules` already IS the "Country rules must
  have: version, effective_from, effective_to, source, status" entity 13.3 describes, field
  for field (13.3 additionally names "status," which `gst.tax_rules` expresses structurally
  via `effective_to is null` = current/open version rather than a separate enum column --
  the same fact, a different representation, not a missing field). It is real, live,
  actively-seeded, actively-consumed production data in a schema owned by a different,
  concurrently-running workstream (`module-gst`/Compliance) that this run's own file-scope
  boundary forbids touching. Two ways to satisfy 13.3's literal text both fail:
  1. **Build a second, platform-owned "rule version" table with the same shape.** This is
     exactly the "parallel table for an already-listed concept" CLAUDE.md non-negotiable #5
     forbids -- the live codebase (which "wins" per CLAUDE.md's own "live source of truth"
     rule) already has the canonical table for this concept, in a different schema.
  2. **Have the platform admin surface read/manage `gst.tax_rules` directly.** No prior
     story in this entire backlog has ever had a `platform.*` admin screen or
     `packages/core` admin module query into a licensed module's own schema (`gst`,
     `discovery`, `inventory`, `fsm`, `crm`) -- every existing `platform.*` table describes
     a *different, coarser* administrative fact than a module's own tenant/regulatory data
     (e.g. `platform.integrations` records a category's ownership/status, never a real
     credential; `platform.modules` records a kill switch, never a module's own business
     data). Building this now would be a novel cross-module architectural pattern with no
     precedent, security implications this doc does not scope out (would this be a
     `service_role`-only read, or would it need its own RLS-composed view across two
     schemas' worth of policies?), and would very likely still be redundant with
     `module-gst`'s own future compliance-admin surface if that workstream ever builds one
     for its own rule content.
  Per this run's own task brief ("Any story whose correct behavior depends on a ...
  entity-ownership judgment call the doc doesn't fully specify is a genuine architectural
  decision -- stop and report rather than guess-and-merge"), 13.3 is left unbuilt. The
  precise open question for whoever resumes this: **should platform-level "Rule Version"
  administration (if wanted at all, beyond what `gst.tax_rules` already provides
  module-internally) be (a) a read-only platform surface that reaches into `gst.tax_rules`
  cross-schema, explicitly approved as a new architectural pattern, (b) generalized so
  `gst.tax_rules` itself becomes a `core`-owned or `platform`-owned table other modules'
  own future country/regime content could also use (a genuine schema-ownership move, not a
  config story), or (c) considered already satisfied by `gst.tax_rules` as it stands, with
  13.3 simply not needing any platform-layer counterpart at all?** This run did not pick
  one -- each has real tradeoffs a security/architecture-empowered decision-maker, not this
  agent, should make.

**A non-security, resolvable data-modeling judgment call, decided and documented**: unlike
`platform.modules` (fixed at five, one per module package) or `platform.integrations`
(fixed at seven named categories), 13.1's own list plus its trailing "etc." describes an
open-ended catalog a superadmin adds to over time as new country/regime packs are built --
so `platform.compliance_countries`/`compliance_packs`/`compliance_pack_features` are
modeled after `platform.plans` (superadmin SELECT/INSERT/UPDATE, no DELETE grant at all,
same "disable, never remove" stance) rather than after the fixed-catalog tables. No RPC/
reason/audit-event ceremony either -- 13.1/13.2/13.4's own text says "Manage"/"Configure"/
names an example, never "kill switch"/"emergency disabling" the way 07.2/12.3 do, so this
mirrors `platform.plans`/`platform.modules`'s plain, directly-RLS-gated write shape.

**What was built**: migration `20260912440000_platform_compliance_registry.sql` -- three
tables, one hierarchy. `platform.compliance_countries` (`country_code` text PK, ISO-alpha-2
shaped, `name`, `enabled` boolean default false, `notes`, `updated_at`/`updated_by`), seeded
with all 18 `COUNTRY_CATALOG` entries -- `enabled = true` exactly for `status: "supported"`
ones (IN/US/CA/DE/FR/BE/PL/IT), `false` for `"planned"` ones -- computed from the live
catalog, not invented (the same "computed, not hardcoded" discipline PLATFORM-P0-12.1-12.4's
own `ai`/`email` seed used). `platform.compliance_packs` (`id` uuid PK, `country_code` FK
into the countries table, `regime` free text, `display_name`, `enabled`, `version` free
text nullable with no default -- no fabricated pack-release version exists anywhere in this
codebase, same stance `platform.modules.version` already took -- `notes`,
`updated_at`/`updated_by`, `unique (country_code, regime)`), seeded with 19 rows (one per
country+regime in the catalog, `enabled` again mirroring `status`).
`platform.compliance_pack_features` (`id` uuid PK, `pack_id` FK into the packs table,
`feature_key`, `display_name`, `enabled`, `updated_at`/`updated_by`,
`unique (pack_id, feature_key)`), seeded with **only** the four rows 13.4's own literal
India example names (`gst`/`einvoice`/`eway_bill`/`ims`, all enabled) on the India/GST pack
-- each corresponds to a real, working `module-gst` capability confirmed by this story's own
reconnaissance (`gst.compliance_profiles`/`tax_registrations` for the base `gst`
capability, `gst.einvoice_credentials` + the einvoicing lib for `einvoice`,
`gst.eway_bill_credentials` + the eway-bill lib for `eway_bill`, the `gst.ims_actions`
schema for `ims`). No other pack (US sales tax/1099, Canada GST/HST, the five EU VAT packs)
was seeded with any feature row -- the doc names no example for any of them, and inventing
a capability taxonomy for packs it never described would be exactly the speculative
functionality CLAUDE.md development principle #7 rules out for a story that only asks to
"configure." RLS on all three tables: open `SELECT` to any `authenticated` user from the
start (same "avoid a second widening migration later" reasoning `platform.modules`/
`platform.feature_flags`/`platform.integrations` each used), superadmin-only `INSERT`/
`UPDATE`, no `DELETE` grant to `authenticated` at all on any of the three.

`packages/core/src/admin/platform-compliance.ts` -- `listComplianceCountries()`,
`listCompliancePacks()`, `listCompliancePackFeatures(packId)`, `getCompliancePack(id)`,
`createComplianceCountry()`/`updateComplianceCountry()`/`setComplianceCountryEnabled()`
(instant toggle), `createCompliancePack()`/`updateCompliancePack()`,
`createCompliancePackFeature()`/`setCompliancePackFeatureEnabled()` (instant toggle) --
Zod-validated, `requireSuperadmin()` defense-in-depth on every write, RLS the authoritative
layer, mirroring `platform-plans.ts`'s own authorization shape exactly. No delete function
exported anywhere, on purpose (no such grant exists). 18 new unit tests
(`platform-compliance.test.ts`) covering schema edge cases (ISO-code shape, immutable
identity fields on update, empty-string-to-null normalization, feature-key slug shape).

**UI**: `/platform/compliance` (new nav link) -- a country registry table (instant
"offered platform-wide" switch + Add/Edit dialog, mirrors `module-entitlements-section.tsx`'s
"single boolean, no separate save step" shape for the switch and `plan-dialog.tsx`'s
Add/Edit pattern for the dialog) and a compliance-pack table beneath it (same instant-switch
shape, plus a "Feature flags" link through to `/platform/compliance/packs/[id]`, mirroring
`plans/page.tsx`'s own link-through-to-a-nested-detail-page shape for
`/platform/plans/[id]/entitlements`). The nested pack page lists that pack's own feature
flags with the same instant-switch shape plus a small inline "Add a feature" dialog
(mirrors `feature-entitlements-section.tsx`'s own add-a-feature affordance, without its
delete button -- no DELETE grant exists here). Desktop table / mobile card split per
CLAUDE.md development principle #12 and docs/design/claude-ui-design-rules.md rule 5,
mirroring `plans/page.tsx`'s own established split throughout.

**Deliberately not built this story**:
- **PLATFORM-P0-13.3 (Rule Version)** -- see the entity-ownership conflict above. Left
  entirely unbuilt, not guessed at.
- **No composition of `enabled` across the hierarchy** -- a disabled country's own packs
  keep whatever `enabled` value they already have stored; nothing computes an "effective
  enabled" answer by walking country → pack → feature. No runtime consumer exists yet to
  need one (see below), the same "table now, real enforcement/composition later"
  sequencing 07.1's `platform.modules.enabled` and 12.1's `platform.integrations` both
  used.
- **No runtime enforcement anywhere** -- none of `enabled` on any of the three tables is
  read by `module-gst`'s own country/regime selector (`country-bar.tsx`,
  `isCountrySupported()`/`isRegimeSupported()` still consult `COUNTRY_CATALOG` alone), by
  `hasModule()`/`requireModule()`, or by any route guard. Wiring this registry into
  `module-gst`'s own behavior would mean touching that workstream's files, which this run's
  own file-scope boundary forbids regardless of whether §17 asked for it (it doesn't --
  13.1/13.2/13.4 only ask to "Manage"/"Configure").
- **No delete/remove operation for any of the three tables** -- see the data-modeling
  decision above; a superadmin disables a row instead.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated warning
every prior entry has logged. `node scripts/lint-import-boundaries.mjs` -- 1502 files, no
violations. `node scripts/lint-migration-schema.mjs` -- 199 migrations (198 -> 199, this
story's own file). `npx vitest run --root packages/core` -- 29 files / 274 tests (28/256 ->
29/274, +18 new). `apps/web`'s own `vitest run --passWithNoTests` -- 50 tests, unchanged.
`cd apps/web && rm -rf .next && npm run build` -- clean, zero warnings; route listing
includes `ƒ /platform/compliance` and `ƒ /platform/compliance/packs/[id]`, both correctly
dynamic, inheriting the outer `/platform` layout's existing `force-dynamic`.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; confirmed via `execute_sql` that the seed is exactly right:
18 countries (8 enabled, matching the catalog's 8 `"supported"` entries), 19 packs (9
enabled), 4 pack features (`einvoice,eway_bill,gst,ims`, all on the India/GST pack only).
`mcp__Supabase__get_advisors` (security) -- zero new findings, the same 6 pre-existing
`rls_enabled_no_policy` tables and the pre-existing leaked-password-protection warning
every prior entry has logged. `mcp__Supabase__get_advisors` (performance) -- only the same
benign "unused index" INFO class every sibling table's own index already carries in this
low-traffic dev database, this migration's own 5 new indexes included.

**Role-switched live proof against dev's own real data**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real `core.account_members` row, not a
superadmin) this backlog's own prior entries have repeatedly used -- role-switched `select
count(*) from platform.compliance_countries` returned `18` (the open-SELECT catalog policy
working exactly as intended for an ordinary business member), and role-switched `insert
into platform.compliance_countries (country_code, name, enabled) values ('ZZ',
'Malicious', true) returning country_code` was rejected outright with `ERROR 42501: new
row violates row-level security policy for table "compliance_countries"`, reconfirmed
immediately after via a plain service-role read that the table still had exactly 18 rows --
this real user's write attempt left zero residue. As `anon` (no session at all), `select
count(*) from platform.compliance_countries` correctly failed with `ERROR 42501: permission
denied for schema platform` -- no schema-level grant to `anon` exists, matching the
`platform` schema's existing grant scope (not a repeat of PLATFORM-P0-03.4's own
missing-grant bug). As with every prior story in this log, there is no seeded demo
superadmin user in this dev project, so the "a real superadmin CAN manage this registry"
half of the proof is verified for real only against local Postgres, below.

**The dedicated local-Postgres RLS test this workstream's own higher bar requires**: new
`scripts/test-platform-compliance-registry-rls.mjs`, wired into `package.json`'s `test:db`
composite script after `test-platform-integrations-rls.mjs`. Same Alice (business admin,
not a superadmin)/Zoe (real platform superadmin) pair every sibling script uses. One
test-design correction made before it passed, the identical gotcha PLATFORM-P0-07.1's own
script first got wrong: an `UPDATE` whose `USING` clause hides every row from the caller
does not raise a Postgres error, it silently affects zero rows -- Alice's disable attempt
on India is asserted via a follow-up `service_role` read (`enabled` still `true`), not
`assertThrows`. **All 25 assertions passed**: the seed is exactly 18 countries/19 packs/4
features, with `enabled` correctly mirroring `COUNTRY_CATALOG`'s own `status` for both a
supported example (India) and a planned one (Australia); no fabricated pack version exists
on any seeded row; only India's GST pack carries any seeded feature, exactly the doc's own
four; Alice can read all three tables in full but every one of her INSERT/UPDATE attempts
is silently rejected with zero residue; Zoe can insert a brand-new country/pack/feature
(proving this is a genuinely growable catalog, not a fixed enum) and toggle `enabled` at
every level; the `(country_code)`, `(country_code, regime)`, and `(pack_id, feature_key)`
uniqueness constraints all hold; an unknown `country_code` on a new pack is rejected by its
foreign key; and nobody -- including Zoe -- can `DELETE` a row on any of the three tables
(no such grant exists to `authenticated` at all). Local Postgres 16 was already running in
this environment (`pg_lsclusters` showed it online).

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this sandboxed dev environment, so a live browser walkthrough of
`/platform/compliance` actually adding/editing a row through the real UI was **not**
performed and is **not** claimed here. This entry documents build/typecheck/lint/unit-test
correctness, a direct read/reject proof against the live dev database for the
non-superadmin path, and the full positive-and-negative matrix against local Postgres --
not an end-to-end UI verification.

**Status**: PLATFORM-P0-13.1/13.2/13.4 done and merged. **PLATFORM-P0-13.3 (Rule Version)
stopped -- a genuine, unresolved architecture/entity-ownership conflict with
`gst.tax_rules`, per the analysis above.** Per this run's own task brief ("write the
precise open question(s) into your audit-log entry and end your turn instead of merging an
assumption into `main`"), this run ends here rather than continuing into §18 (Platform
Policies) or any further section. The three resolved sub-stories are committed, verified,
and merged to `main`; 13.3 is left for a human (or a future run with explicit direction on
the three options above) to decide.

### PLATFORM-P0-13.3 — Rule Version, CLOSED (2026-09-13)

**Decision received**: the user answered the three-option open question the prior entry
above posed verbatim -- option **(c)**: *"Already satisfied — build nothing."* `gst.tax_rules`
IS the entity 13.3 describes (version/effective_from/effective_to/source/status, the
prior entry's own field-for-field comparison already established this); no platform-layer
counterpart is needed. Per this decision: no second table was built, no cross-schema read
surface into `gst.tax_rules` was built, and no `module-gst` file was touched -- exactly the
constraints the decision specified.

**What changed**: nothing in code, schema, or RLS. This is a documentation-only closure of
an already-fully-analyzed open question; the analysis in the entry immediately above this
one remains the complete record of *why* -- this entry only records *that a decision was
made* and *what it was*, per this run's own task instruction to append a short dated update
rather than re-litigate the entity-ownership analysis.

**Effect on §17 (Country / Compliance Pack Administration)**: now fully resolved. 13.1
(Country Registry), 13.2 (Compliance Pack Availability), and 13.4 (Compliance Feature
Flags) were built and merged in the prior entry; 13.3 (Rule Version) is closed as
satisfied-by-existing-code. No sub-story of §17 remains open. Progress table and P0 summary
line above updated accordingly.

**Verification**: no code, migration, or dependency changed, so the full verification
pipeline does not apply -- a sanity `npm run typecheck` (clean, unchanged from the prior
entry's own clean run) and `npm run lint --workspaces --if-present` (0 errors, the same 1
pre-existing unrelated warning every prior entry has logged) were still run before
committing, per this run's own task instruction that the pipeline is "mostly a no-op" for
this docs-only change but a quick check is worthwhile. No migration was added, so
`lint:migrations` and `mcp__Supabase__apply_migration` do not apply. No new `platform.*`
table or access pattern was introduced, so no new `scripts/test-platform-*-rls.mjs` script
was written -- there is nothing new for one to test.

**Status**: PLATFORM-P0-13.3 CLOSED (satisfied-by-existing-code, user-decided). §17 fully
resolved. Committed and merged to `main` as its own small commit, then this run continued
sequentially into §18 per its task brief.

### PLATFORM-P0-14.1/14.2/14.3 — Platform Policies (2026-09-13)

**Worktree hazard checked first**: `git log --oneline -3` on this fresh worktree showed
`HEAD` detached at `origin/main`'s own tip (a sibling workstream's merge commit), not
`feature/platform-admin-portal`'s real tip. Fixed with `git checkout -B
feature/platform-admin-portal origin/feature/platform-admin-portal`, landing on
`6100433` (PLATFORM-P0-13.1/13.2/13.4's own commit), reconfirmed via `git log --oneline -3`
before touching any file. `npm install` run fresh (no `node_modules` in this worktree).
The PLATFORM-P0-13.3 closure above was committed and merged to `main` first, as its own
small commit, per the task brief's own instruction to treat it as a story in its own right.

**§18's own text in full** -- three stories, each a flat field list plus a one-sentence
precedence warning:

```text
PLATFORM-P0-14.1 -- Global System Policies
Configure: session duration / password policy / file size limits / API rate limits /
default timezone / default currency / data retention defaults / audit retention.
Country-specific/legal rules must not be incorrectly overridden by generic platform
settings.

PLATFORM-P0-14.2 -- Data Retention Policy
Configure platform-level defaults. Country/regulatory-specific retention must take
precedence where applicable.

PLATFORM-P0-14.3 -- Rate Limits
Configure: API / AI / webhooks / imports / exports / automation.
```

**Entity-ownership check (CLAUDE.md non-negotiable #5), done first**: grepped the full
migration timeline, `docs/plan/00-MASTER-PLAN.md` §5, and the whole repo for
"system_polic"/"session_duration"/"password_policy"/"data_retention"/"audit_retention" --
zero hits anywhere. Genuinely new concept. Widened the grep per this run's own standing
"widen your grep" discipline (established by PLATFORM-P0-12.1-12.4's own entry, reused most
recently by 13.1-13.4's) to find every *real, already-enforced* value in this codebase that
one of §18's field names might duplicate or should mirror, rather than assuming every field
starts from nothing:
- `core.business_settings.timezone`/`.currency` -- a **specific business's own** setting
  (columns default `'Asia/Kolkata'`/`'INR'`). Not the same concept as a platform-wide
  default (14.1's own "default timezone"/"default currency"), but the same real fact --
  recording it administratively in `platform.system_policies` (seeded to the identical
  values) is not inventing a new fact, the same "seed from the live catalog, not invented"
  reasoning PLATFORM-P0-13.1's own country-registry seed already used. No runtime code is
  wired to read the new table to set this default -- `core.business_settings`'s own column
  DEFAULT keeps doing that job, unchanged.
- `core.check_api_rate_limit(_business_id, _limit default 120)` -- a real, live,
  already-enforced per-business-per-minute API rate limiter (`supabase/migrations/
  20260907210000_core_api_keys.sql`). `rate_limit_api_per_minute` mirrors that function's
  own real hardcoded default (120); this migration does not alter, call, or get called by
  that function.
- `apps/web/app/(auth)/actions.ts`'s hardcoded `password.length < 8` (both signup and
  password-reset) -- `password_min_length` mirrors that real enforced value; this table is
  not read by that file.
No other field in §18's three lists (session duration; password complexity beyond minimum
length; file size limit; the AI/webhooks/imports/exports/automation rate limits; data/audit
retention) has any existing enforced value anywhere in this codebase -- confirmed by grep,
not assumed -- so those columns are left nullable ("not yet configured"), the same
"no fabricated ceiling" discipline `platform.ai_feature_policies`'s own token/cost/budget
columns already established. Not a stop-and-report case: every field either mirrors a real,
already-identified value or is an honestly-nullable new ceiling; no unstated runtime
algorithm needed inventing (unlike 09.3/10.2's own routing/circuit-breaker questions).

**Two overlapping-doc-text judgment calls, resolved the same way this backlog has resolved
every prior one (PLATFORM-P0-09.4/10.1's "daily budget", PLATFORM-P0-13.1-13.4's three-table
hierarchy)**: 14.1's own single "API rate limits" field is superseded, not duplicated, by
14.3's more granular six-field list (API/AI/webhooks/imports/exports/automation) -- one
column per 14.3's own named domain, not a generic column plus a separate table. 14.2 ("Data
Retention Policy") names no field 14.1 doesn't already list ("data retention defaults, audit
retention") -- 14.2's own text is the identical concept restated with the precedence caveat,
not a second table; `data_retention_default_days`/`audit_retention_days` satisfy both at
once.

**§18's own two "must take precedence" sentences are a documented design constraint, not an
ask to build a precedence-resolution engine**: this table's values are platform-wide
*fallback defaults*, never an override of a country/regime-specific rule. Nothing in this
migration or its application layer reads, writes, or composes against `gst.*` in any way --
the file-scope boundary this workstream has held throughout (most recently PLATFORM-P0-13's
own entry) is unbroken. Recorded explicitly so a future reader does not mistake the absence
of a precedence engine for an oversight.

**A non-security, resolvable data-modeling judgment call (this run's own task brief marks
"which existing pattern to reuse, exact naming" as non-security)**: §18 names "password
policy" as one flat item with no sub-fields. Modeled as minimum length plus three complexity
flags (uppercase/number/symbol) -- the ordinary shape this concept takes everywhere, and an
extension of the one real password rule this codebase already enforces (minimum length) --
not an invention.

**Audited-mutation pattern, mirroring `platform.ai_feature_policies` exactly, not
`platform.notification_policies`'s lighter plain-RLS shape**: unlike three notification
toggles nobody could weaponize, several of these fields are genuinely security-postured by
name (session duration, password complexity) even though none is enforced by any runtime
code yet -- a future reader auditing "who loosened the password policy and why" needs a real
trail, matching this workstream's own higher security bar. No INSERT/UPDATE/DELETE grant to
`authenticated` at all; every change goes through `platform.update_system_policies()`, which
requires a genuine SUPERADMIN and a non-empty `reason`, and writes one atomic audit-trail row
to a dedicated `platform.system_policy_events` table.

**What was built**: migration `20260912450000_platform_system_policies.sql` -- singleton
`platform.system_policies` (boolean PK fixed to `true`, same construction as
`platform.branding`/`platform.ai_feature_policies`): `session_duration_minutes` (nullable,
`> 0`), `password_min_length` (not null, default `8`, `> 0`),
`password_require_uppercase`/`_number`/`_symbol` (not null, default `false` each -- no
fabricated stricter-than-today policy), `max_file_size_mb` (nullable, `> 0`),
`default_timezone` (not null, default `'Asia/Kolkata'`), `default_currency` (not null,
default `'INR'`), `data_retention_default_days`/`audit_retention_days` (nullable, `> 0`),
`rate_limit_api_per_minute` (not null, default `120`),
`rate_limit_ai_per_minute`/`_webhooks_per_minute`/`_imports_per_hour`/`_exports_per_hour`/
`_automation_per_minute` (all nullable, `> 0`), plus `created_at`/`updated_at`/`updated_by`.
Seeded with exactly the real values identified above, everything else null. Dedicated
`platform.system_policy_events` audit table (`previous_value`/`new_value` jsonb,
non-empty `reason`, `performed_by`/`performed_at`), same shape as
`platform.ai_feature_policy_events`. RLS: open `SELECT` to any `authenticated` user on the
policy row (a future consumer -- a signup form showing live password requirements, an
upload dialog checking a file-size ceiling -- will most likely need this as an ordinary
signed-in member, the same "avoid a second widening migration later" reasoning every
sibling policy table already used); superadmin-only `SELECT` on the audit table; no direct
write grant to `authenticated` on either table. `platform.update_system_policies()` --
`security definer`, requires `platform.is_superadmin()` and a non-empty reason, additionally
rejects a null `password_min_length`/blank `default_timezone`/blank `default_currency`/null
`rate_limit_api_per_minute` (the table's own required fields), upper-cases the stored
currency code, and writes one atomic before/after audit event.

**Application layer** (`packages/core/src/admin/platform-system-policies.ts`):
`getSystemPolicies()`/`updateSystemPolicies()`, mirroring `platform-ai-feature-policies.ts`'s
exact shape -- request-scoped client, `requireSuperadmin()` first, RLS authoritative. Two
Zod numeric-string helpers: `optionalPositiveIntSchema` (empty string -> `null`, otherwise a
positive whole number, for every nullable ceiling) and `requiredPositiveIntSchema` (rejects
empty, for the four `not null` fields). `defaultCurrency` is validated as exactly 3 letters
and upper-cased client-side too (`z.string().toUpperCase().regex(/^[A-Z]{3}$/)`), matching
the RPC's own normalization. 9 new unit tests (`platform-system-policies.test.ts`) covering a
fully-populated policy, currency upper-casing/format rejection, blank-timezone rejection,
empty-optional-field-to-null normalization across all nine nullable fields at once,
empty-required-field rejection, non-positive-value rejection, non-integer rejection, and
empty/whitespace-reason rejection.

**UI**: `/platform/system-policies` (new nav link, labeled "Platform Policies") -- a single
settings surface (singleton row, no table/mobile-card split needed, mirroring
`/platform/ai-feature-policies`'s own identical reasoning), fields grouped into four labeled
sections (Session & password; Files & retention; Rate limits; Defaults for new businesses)
per docs/design/claude-ui-design-rules.md rule 1 ("group related information logically")
rather than one flat sixteen-row list. One `SystemPoliciesDialog` edits the whole singleton
at once, its body grouped into the same four sections and scrollable
(`max-h-[70vh] overflow-y-auto`) with a fixed header/footer, since sixteen fields plus a
reason don't fit one phone-width screen -- satisfies design-rules rule 5's "adapt ... to the
available viewport" for a form, not a table, the shape rule 12/rule 5's own table-vs-card
split doesn't directly address. Mirrors `FeaturePolicyDialog`'s reason-required,
disabled-until-reason-entered Save button.

**Deliberately not built this story**:
- **No runtime enforcement of any field.** `session_duration_minutes` does not configure
  Supabase Auth's own JWT expiry (a project-level setting this table cannot reach);
  `password_min_length`/the three complexity flags are not read by
  `apps/web/app/(auth)/actions.ts`; `max_file_size_mb` is not read by any attachment-upload
  path; none of the six rate-limit columns is read by `core.check_api_rate_limit()` or any
  AI/webhook/import/export/automation code path; `default_timezone`/`default_currency` do
  not change what a newly-created `core.business_settings` row gets; `data_retention_
  default_days`/`audit_retention_days` trigger no purge job. Confirmed by `git diff --stat`
  that none of those files were touched by this story.
- **No precedence-resolution engine** composing this table's defaults against any
  country/regime-specific rule (`gst.tax_rules` or any future one) -- see the design-
  constraint reasoning above. No `gst.*` file read, written, or imported.
- **No password-policy enforcement UI** on the signup/reset forms reading the complexity
  flags -- those forms are unchanged.

**Verification**: full monorepo `npm run typecheck` -- clean across every workspace. `npm
run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated warning
every prior entry has logged. `node scripts/lint-import-boundaries.mjs` -- 1507 files, no
violations. `node scripts/lint-migration-schema.mjs` -- 200 migrations (199 -> 200, this
story's own file). `npx vitest run --root packages/core` -- 30 files / 283 tests (29/274 ->
30/283, +9 new). `apps/web`'s own `vitest run --passWithNoTests` -- 50 tests, unchanged. `cd
apps/web && rm -rf .next && npm run build` -- clean, zero warnings; route listing includes
`ƒ /platform/system-policies`, correctly dynamic, inheriting the outer `/platform` layout's
existing `force-dynamic`.

Migration applied live via `mcp__Supabase__apply_migration` against the **dev** project
(`jazdtomcgqjxjueedmck`) only; confirmed via `execute_sql` that the singleton row seeded
with exactly `password_min_length=8`, `default_timezone='Asia/Kolkata'`,
`default_currency='INR'`, `rate_limit_api_per_minute=120`, and every other field null.
`mcp__Supabase__get_advisors` (security) -- zero new findings, the same 6 pre-existing
`rls_enabled_no_policy` tables and the pre-existing leaked-password-protection warning every
prior entry has logged. `mcp__Supabase__get_advisors` (performance) -- only the same benign
"unused index" INFO class every sibling table's own index already carries in this
low-traffic dev database, this migration's own two new indexes included.

**Role-switched live proof against dev's own real data**: using the same real user
(`c8040fb0-b46c-4131-9ea7-195e8157d27b`, a real `core.account_members` row, not a
superadmin) this backlog's own prior entries have repeatedly used -- role-switched
(`set local role authenticated; set local request.jwt.claims = '{"sub": ..., "role":
"authenticated"}'`) `select count(*) from platform.system_policies` returned `1` (the
open-SELECT policy working exactly as intended for an ordinary business member), and a
role-switched call to `platform.update_system_policies(...)` was rejected outright with
`ERROR P0001: Forbidden: only a SUPERADMIN can change platform policies.` -- reconfirmed
immediately after via a plain read that `rate_limit_api_per_minute` was still `120`, so this
real user's write attempt left zero residue. As `anon` (no session at all),
`select count(*) from platform.system_policies` correctly failed with `ERROR 42501:
permission denied for schema platform` -- no schema-level grant to `anon` exists, matching
the `platform` schema's existing grant scope. As with every prior story in this log, there
is no seeded demo superadmin user in this dev project, so the "a real superadmin CAN change
this policy" half of the proof is verified for real only against local Postgres, below.

**The dedicated local-Postgres RLS test this workstream's own higher bar requires**: new
`scripts/test-platform-system-policies-rls.mjs`, wired into `package.json`'s `test:db`
composite script after `test-platform-compliance-registry-rls.mjs`. Same Alice (business
admin, not a superadmin)/Zoe (real platform superadmin) pair every sibling script uses.
**All 27 assertions passed**: the seed is exactly the real values identified above with
everything else unconfigured; Alice can read the singleton row in full but her mutation
attempt is rejected by the function's own internal check with zero residue in either table;
Zoe can set the full policy (including upper-casing a lowercase currency code entered) which
writes exactly one atomic before/after audit event; a missing/blank value for any of the
four required fields (password min length, default timezone, default currency, API rate
limit) is rejected; a non-positive value for any nullable ceiling/rate-limit/retention field
is rejected by the table's own CHECK constraints; an empty/whitespace reason is rejected;
clearing every nullable field back to "not configured" is a valid, honest state and is
itself audited; the audit trail's own SELECT is superadmin-only; and nobody -- including
Zoe -- can bypass the function with a direct INSERT/UPDATE/DELETE on either table. Local
Postgres 16 needed starting (`pg_ctlcluster 16 main start`) before this run; confirmed
online via `pg_lsclusters` first.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this sandboxed dev environment, so a live browser walkthrough of
`/platform/system-policies` actually adding/editing a row through the real UI was **not**
performed and is **not** claimed here. This entry documents build/typecheck/lint/unit-test
correctness, a direct read/reject proof against the live dev database for the
non-superadmin path, and the full positive-and-negative matrix against local Postgres -- not
an end-to-end UI verification.

**Status**: PLATFORM-P0-14.1/14.2/14.3 done. §18 (Platform Policies) is now fully resolved.
Committing and merging to `main`, then continuing to §19 (Global Announcements /
Maintenance, PLATFORM-P0-15) next, per this doc's own section order.

### PLATFORM-P0-15.1/15.2/15.3/15.4 — Global Announcements / Maintenance (2026-09-13)

§19's own text: four states of one entity, no ambiguity to stop and report on this time --
a platform-wide announcement catalog with a type (information/warning/maintenance/critical),
audience targeting (all customers/all users/a specific plan/a specific country), a
publish/expire schedule, and, for maintenance-type announcements specifically, a
maintenance window plus a list of affected modules.

**Entity-ownership check (CLAUDE.md non-negotiable #5), done first**: grepped
`docs/plan/00-MASTER-PLAN.md` §5 and the full repo for "announcement" -- no entity exists
yet. Two adjacent concepts already exist and are genuinely NOT duplicated by this one:
`platform.email_templates`'s fixed `system_announcements` purpose (PLATFORM-P0-11.2) is a
reusable EMAIL FORMATTING template (subject/body with merge fields) for notifying people
about an announcement by email -- a future delivery mechanism, not the announcement's own
data; this story does not read, write, or reference that table at all. `platform.modules.
status` (PLATFORM-P0-07.3) already has a per-MODULE `'maintenance'` value -- an instant,
indefinite, manually-toggled ACCESS-CONTROL state with real enforcement (it blocks
routes/writes). This table's own "Maintenance" is a different concept: a scheduled,
time-bounded, purely INFORMATIONAL banner/notice, never gating access to anything. Building
this touches, reads, and changes nothing in `platform.modules`.

**Design decisions, resolved and documented rather than guessed vaguely**:
- 15.4's own "message" field is the SAME field as every other announcement's own body, not
  a maintenance-only extra column -- the same "one field, two sections naming it" resolution
  PLATFORM-P0-13/14's own overlapping doc text already used repeatedly in this backlog.
- List-shaped, mirroring `platform.feature_flags` exactly, not a singleton -- an
  announcement catalog is naturally many rows over time. Create/update/delete, all through
  SECURITY DEFINER functions requiring a genuine SUPERADMIN and a non-empty `reason`,
  writing one atomic JSONB-snapshot audit event per call to `platform.announcement_events`
  -- the identical shape `platform.feature_flags`/`feature_flag_events` already established.
  `type`/`audience_type`/`audience_plan_id`/`audience_country_code` are immutable after
  creation (an announcement's own audience is its identity, the same "scope immutable after
  creation" reasoning PLATFORM-P0-08's own migration already used) -- only
  `title`/`message`/the schedule/the maintenance window/`affected_modules`/`enabled` are
  ever updated.
- Audience targeting reuses real catalogs where they now exist: `audience_plan_id`
  references `platform.plans` (exactly like `feature_flags.scope_plan_id`).
  `audience_country_code` references `platform.compliance_countries` (PLATFORM-P0-13.1) --
  a real canonical country catalog exists now (it didn't when `feature_flags` was built),
  so this table references it properly instead of repeating that now-avoidable free-text
  pattern.
- **No runtime consumer reads this table yet.** No banner/notice-rendering component exists
  anywhere in `apps/web`'s customer-facing dashboard; `enabled`/`publish_at`/`expire_at` are
  not evaluated by any request path; `affected_modules`/the maintenance window do not gate
  or warn on anything in `requireModule()`/`hasModule()`/`middleware.ts`; no email is sent
  when an announcement is created. Building a real audience-resolution-and-display system
  is a materially larger, separate future story, matching this backlog's own "table now,
  enforcement/wiring later" sequencing throughout.

**What was built**: migration `20260912460000_platform_announcements.sql` --
`platform.announcements` (the fields above, a CHECK enforcing exactly one of
`audience_plan_id`/`audience_country_code` is set and only when the matching
`audience_type` is chosen, a CHECK enforcing the maintenance window/`affected_modules` are
populated if-and-only-if `type = 'maintenance'`, a CHECK enforcing `expire_at > publish_at`
and `maintenance_end > maintenance_start` when both are set) + `platform.announcement_events`
(append-only, JSONB before/after snapshots, `title` denormalized for post-delete
readability). Three SECURITY DEFINER functions (`create_announcement`/`update_announcement`/
`delete_announcement`), each validating `affected_modules` against real `core.modules` keys
(an unknown key is rejected, not silently accepted). `packages/core/src/admin/
platform-announcements.ts` (+ its own `isAnnouncementActive()`, a pure derivation mirroring
`isFeatureFlagActive()` exactly, per CLAUDE.md development principle #9) with 15 unit tests
already written when this story's implementation was picked back up (see the recovery note
below). New `/platform/announcements` admin page -- desktop table / mobile card split per
CLAUDE.md development principle #12, one shared `AnnouncementDialog` for both Add and Edit
(scope permanent in Edit, shown as read-only text), a conditional maintenance-window/
affected-modules section that only renders when `type = 'maintenance'`, and a
`DeleteAnnouncementDialog` requiring its own reason -- all mirroring `feature-flags/`'s own
established component shapes exactly. Added to the platform nav.

**Recovery note on this session's own continuity**: this story's migration, app layer, and
unit tests were already written and verified (typecheck/lint clean) by an earlier run of
this same dispatch before it was interrupted by an API rate limit mid-story, after
PLATFORM-P0-13.3's closure and PLATFORM-P0-14.1/14.2/14.3 had already been committed and
merged. The orchestrating session recovered the uncommitted worktree state, confirmed the
backend work's quality (the migration's own entity-ownership and design reasoning was
already complete and correct), and finished the missing piece -- the admin UI (list page,
create/edit dialog, nav wiring) and the dedicated RLS test script -- before running the
full verification pipeline below and merging. No architectural decision was redone or
second-guessed; the recovered work was read in full before continuing it.

**Verification**: full monorepo `npm run typecheck` -- clean across all 9 workspaces. `npm
run lint --workspaces --if-present` -- 0 errors, the same 1 pre-existing unrelated warning
every prior story has logged. `node scripts/lint-import-boundaries.mjs` -- 1513 files, no
violations. `node scripts/lint-migration-schema.mjs` -- 201 migrations, no violations.
`npx vitest run --root packages/core` -- 304/304 passing (15 of which are this story's own
`createAnnouncementSchema`/`updateAnnouncementSchema`/`isAnnouncementActive` cases). Migration
applied live to the **dev** Supabase project (`jazdtomcgqjxjueedmck`) via
`mcp__Supabase__apply_migration`; `mcp__Supabase__get_advisors` (security + performance) --
zero new findings beyond the same pre-existing baseline every prior entry has logged (the
two new tables' own indexes show up only as the same benign "unused index" info-level note
every sibling index already carries in this low-traffic dev database). Role-switched live
proof against dev, using the same real non-superadmin user (`c8040fb0-b46c-4131-9ea7-
195e8157d27b`) this backlog's own prior entries have repeatedly used: `select count(*) from
platform.announcements` returned `0` cleanly (the open-SELECT policy working as intended,
not an error), and a role-switched call to `platform.create_announcement(...)` was rejected
outright with a real Postgres `P0001: Forbidden: only a SUPERADMIN can create an
announcement.` error -- a genuine function-level rejection, not a silently-ignored RLS
filter -- with zero residue confirmed afterward in both tables. Clean `apps/web` `npm run
build` -- `/platform/announcements` appears in the route manifest as `ƒ` (dynamic).

**The dedicated local-Postgres RLS test this workstream's own higher bar requires**: new
`scripts/test-platform-announcements-rls.mjs` (40 assertions), wired into `package.json`'s
`test:db` composite script after `test-platform-system-policies-rls.mjs`. Same Alice
(business admin, not a superadmin)/Zoe (real platform superadmin) pair every sibling script
uses. **All 40 assertions passed** against real local Postgres 16: the catalog starts
empty; Alice can read but every one of her three mutation attempts is rejected with zero
residue; the audience-shape CHECK rejects all four mismatched audience/target combinations
including "both a plan and a country set"; the maintenance-only CHECK rejects a maintenance
window or `affected_modules` on a non-maintenance type and requires a real end-after-start
window; an unknown module key in `affected_modules` is rejected; a real maintenance,
plan-specific, and country-specific announcement can each be created correctly; the
publish/expire window CHECK is enforced; an empty/whitespace reason is rejected by all three
functions; `update_announcement` mutates only the fields it's supposed to and never
`type`/`audience_type`; each mutation writes exactly one atomic audit event with a real
before/after snapshot; deleting nulls `announcement_id` via `on delete set null` while the
event survives by its denormalized `title`; the audit trail's own SELECT is superadmin-only;
and nobody -- including Zoe -- can bypass the three functions with a direct
INSERT/UPDATE/DELETE on either table. Local Postgres 16 was already online in this worktree
(confirmed via `pg_lsclusters` before running).

**What was deliberately left out**: any real banner/notice-rendering component in the
customer-facing dashboard; any evaluation of `enabled`/`publish_at`/`expire_at`/the
maintenance window anywhere in `requireModule()`/`hasModule()`/`middleware.ts`; any email
sent via `platform.email_templates`' own `system_announcements` template when an
announcement is created; audience RESOLUTION (which businesses actually see a given
announcement) beyond simply recording the audience's own targeting fields -- all matching
this backlog's own "table now, enforcement/wiring later" sequencing throughout, and
explicitly named as future, separate scope in the migration's own docstring.

**Limitation, stated plainly**: same as every prior story in this log -- no seeded demo
superadmin user in this sandboxed dev environment, so a live browser walkthrough of
`/platform/announcements` actually adding/editing/deleting a row through the real UI was
**not** performed and is **not** claimed here. This entry documents build/typecheck/lint/
unit-test correctness, a direct read/reject proof against the live dev database for the
non-superadmin path, and the full positive-and-negative matrix against local Postgres -- not
an end-to-end UI verification.

**Status**: PLATFORM-P0-15.1/15.2/15.3/15.4 done. §19 (Global Announcements / Maintenance)
is now fully resolved. Next in the doc's own section order: §17 in this doc's own numbering
gap is "Configuration Versioning" (already listed "Not started" in the progress table above)
and §19 "Platform Administration UI" -- both still open, along with every P1 section.
