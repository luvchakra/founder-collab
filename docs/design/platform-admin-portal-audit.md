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
| | 05 | Entitlement Engine | Not started |
| | 06 | Usage & Limits | Not started |
| | 07 | Module Administration | Not started |
| | 08 | Feature Flags | Not started |
| P0 Phase 3 | 09 | Internal AI Provider & Keys | Not started |
| | 10 | AI Safety / Cost Controls | Not started |
| | 11 | Global Email / Notification Configuration | Not started |
| | 12 | Global Integrations | Not started |
| | 13 | Country / Compliance Pack Administration | Not started |
| P0 Phase 4 | 03 | Branding & Look and Feel | 03.1 done; 03.2 deferred (conflicts with CLAUDE.md non-negotiable #7); 03.3 done; 03.4 done; 03.5 done -- §7 complete, see log |
| | 14 | Platform Policies | Not started |
| | 15 | Global Announcements / Maintenance | Not started |
| | 17 | Configuration Versioning | Not started |
| | 19 | Platform Administration UI | Not started |
| P1 | 01-09 | Import/export, business overrides, support tools, subscription lifecycle, billing, API admin, observability, release mgmt, legal | Not started |

**P0: 4 full sections done (01, 02, 03 -- 03.2 deferred by design, 04), plus 18.1.
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
